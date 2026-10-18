import type { ErrorCode, GatewayError } from "@gateway/shared";

/**
 * Gateway error response. Builds a Headers object first (spreading
 * HeadersInit into an object literal is unreliable for Headers instances /
 * tuple arrays), merges caller-supplied headers, then sets required headers
 * explicitly.
 */
export function gatewayError(
  code: ErrorCode,
  message: string,
  requestId: string,
  status: number,
  headers?: HeadersInit,
): Response {
  const merged = new Headers(headers ?? undefined);
  merged.set("Content-Type", "application/json");
  merged.set("Cache-Control", "no-store");

  const body: GatewayError = { code, message, requestId };
  return new Response(JSON.stringify(body), { status, headers: merged });
}

/** Non-gateway-error JSON response (e.g. internal admin surfaces). */
export function errorResponse(
  status: number,
  body: Record<string, string>,
  headers?: HeadersInit,
): Response {
  const merged = new Headers(headers ?? undefined);
  merged.set("Content-Type", "application/json");
  merged.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { status, headers: merged });
}
