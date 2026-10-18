import type { ErrorCode, OriginConfig } from "@gateway/shared";

import { gatewayError } from "../errors/responses.js";

export interface ForwardOutcome {
  readonly response: Response;
}

const BLOCKED_REQUEST_HEADERS = new Set([
  "cookie",
  "authorization",
  "x-forwarded-for",
  "x-forwarded-proto",
  "x-forwarded-host",
]);

const BLOCKED_RESPONSE_HEADERS = new Set([
  "set-cookie", // backends must not set session cookies
  "connection",
  "keep-alive",
  "transfer-encoding", // body is re-streamed
]);

export interface ForwardOptions {
  readonly maxBodyBytes?: number;
  readonly allowRedirects?: boolean;
  readonly requestId: string;
}

/**
 * Forward an authorized request to its fixed origin.
 *
 * Body-limit semantics (Review Focus 3): Content-Length is checked
 * pre-flight; streamed bodies are counted en route and the upstream request
 * is aborted on overflow. Partial upstream writes may exist when the limit
 * trips mid-stream — this is documented behavior, never a rollback.
 */
export async function forwardToOrigin(
  request: Request,
  originConfig: OriginConfig,
  destinationPath: string,
  identityHeaders: Headers,
  deadlineMs: number,
  options: ForwardOptions,
): Promise<Response> {
  const search = new URL(request.url).search;
  const target = originConfig.url + destinationPath + search;

  if (options.maxBodyBytes !== undefined) {
    const len = request.headers.get("Content-Length");
    if (len !== null && Number.isInteger(Number(len)) && Number(len) > options.maxBodyBytes) {
      return gatewayError(
        "PAYLOAD_TOO_LARGE",
        "Request body exceeds the route size limit",
        options.requestId,
        413,
      );
    }
  }

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(new DOMException("Deadline exceeded", "TimeoutError")), deadlineMs);

  let overflowed = false;
  let counted = 0;
  const body = request.body?.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        counted += chunk.byteLength;
        if (options.maxBodyBytes !== undefined && counted > options.maxBodyBytes) {
          overflowed = true;
          abort.abort(new DOMException("Body limit exceeded", "AbortError"));
          controller.terminate();
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );

  const upstreamHeaders = new Headers();
  request.headers.forEach((value, name) => {
    if (!BLOCKED_REQUEST_HEADERS.has(name.toLowerCase())) upstreamHeaders.set(name, value);
  });
  identityHeaders.forEach((value, name) => upstreamHeaders.set(name, value));

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers: upstreamHeaders,
      body: body ?? null,
      redirect: options.allowRedirects === true ? "manual" : "error",
      signal: abort.signal,
    });

    const responseHeaders = new Headers();
    upstream.headers.forEach((value, name) => {
      if (!BLOCKED_RESPONSE_HEADERS.has(name.toLowerCase())) responseHeaders.set(name, value);
    });
    responseHeaders.set("Cache-Control", "no-store");

    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch (err) {
    if (overflowed) {
      return gatewayError(
        "PAYLOAD_TOO_LARGE",
        "Request body exceeds the route size limit; upstream may have received a partial write",
        options.requestId,
        413,
      );
    }
    const isTimeout =
      err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError");
    const code: ErrorCode = isTimeout ? "BACKEND_TIMEOUT" : "BACKEND_UNAVAILABLE";
    return gatewayError(
      code,
      isTimeout ? "Backend request deadline exceeded" : "Backend is unreachable",
      options.requestId,
      isTimeout ? 503 : 502,
    );
  } finally {
    clearTimeout(timer);
  }
}
