import type { AuthorizeAllow, AuthorizeRequestBody, ErrorCode } from "@gateway/shared";

import type { ExtractedCredential } from "../credential/adapter.js";

export type AuthorizeOutcome =
  | { readonly status: "allow"; readonly result: AuthorizeAllow }
  | { readonly status: "deny"; readonly code: ErrorCode; readonly httpStatus: number }
  | { readonly status: "unavailable"; readonly retryAfterSeconds?: number }
  | { readonly status: "bad-response" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidFutureRfc3339(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const ms = Date.parse(value);
  return !Number.isNaN(ms) && ms > Date.now();
}

function parseAllow(body: unknown, requested: AuthorizeRequestBody): AuthorizeAllow | null {
  if (!isRecord(body)) return null;
  if (body.contractVersion !== 1) return null;
  if (body.decision !== "allow") return null;
  const user = body.user;
  const session = body.session;
  if (!isRecord(user) || typeof user.id !== "string" || user.id === "") return null;
  if (!isRecord(session)) return null;
  if (typeof session.id !== "string" || session.id === "") return null;
  if (typeof session.userId !== "string" || session.userId !== user.id) return null;
  if (!isValidFutureRfc3339(session.expiresAt)) return null;

  const base = {
    contractVersion: 1,
    decision: "allow",
    user: { id: user.id },
    session: { id: session.id, userId: session.userId, expiresAt: session.expiresAt },
  } as const;

  if (requested.policy.kind === "organization-permission") {
    if (typeof body.organizationId !== "string" || body.organizationId === "") return null;
    if (body.organizationId !== requested.policy.organizationId) return null;
    return { ...base, organizationId: body.organizationId };
  }
  if (body.organizationId !== undefined) return null; // must be absent otherwise
  return base;
}

function mapDeny(status: number, body: unknown): { code: ErrorCode; httpStatus: number } {
  if (isRecord(body) && typeof body.code === "string") {
    switch (body.code) {
      case "NO_CREDENTIAL":
      case "INVALID_SESSION":
      case "SESSION_EXPIRED":
      case "FORBIDDEN":
        return { code: body.code, httpStatus: status };
      default:
        break;
    }
  }
  return { code: status === 401 ? "INVALID_SESSION" : "FORBIDDEN", httpStatus: status };
}

/**
 * Call POST /_internal/v1/authorize over the AUTH_WORKER service binding.
 * Never retries. Credential forwarded as Cookie/Authorization header (never
 * body, never logged). Fails closed on timeout, unavailability, or any
 * contract violation.
 */
export async function callAuthorize(
  fetcher: Fetcher,
  credential: ExtractedCredential,
  requestBody: AuthorizeRequestBody,
  deadlineMs: number,
  clientIp: string | null,
): Promise<AuthorizeOutcome> {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (credential.kind === "bearer") {
    headers.set("Authorization", `Bearer ${credential.value}`);
  } else {
    // The original recognized cookie name must survive extraction; we never
    // invent one (spec Section 5 reconciliation note).
    if (credential.name === undefined || credential.name === "") {
      return { status: "bad-response" };
    }
    headers.set("Cookie", `${credential.name}=${credential.value}`);
  }
  if (clientIp !== null) headers.set("Gateway-Client-IP", clientIp);

  const abort = new AbortController();
  const timer = setTimeout(
    () => abort.abort(new DOMException("Deadline exceeded", "TimeoutError")),
    deadlineMs,
  );

  let upstream: Response;
  try {
    upstream = await fetcher.fetch("https://auth.internal/_internal/v1/authorize", {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: abort.signal,
    });
  } catch {
    return { status: "unavailable" }; // §10.21: timeout/unavailable -> 503 upstream, no retry
  } finally {
    clearTimeout(timer);
  }

  if (upstream.status === 200) {
    let json: unknown;
    try {
      json = await upstream.json();
    } catch {
      return { status: "bad-response" };
    }
    const allow = parseAllow(json, requestBody);
    if (allow === null) return { status: "bad-response" }; // §10.20 -> 502
    return { status: "allow", result: allow };
  }

  if (upstream.status === 401 || upstream.status === 403) {
    let json: unknown = null;
    try {
      json = await upstream.json();
    } catch {
      json = null;
    }
    const deny = mapDeny(upstream.status, json);
    return { status: "deny", code: deny.code, httpStatus: deny.httpStatus };
  }

  if (upstream.status === 502) return { status: "bad-response" };
  return { status: "bad-response" }; // any unexpected status
}
