import type { PermissionCatalog } from "@gateway/shared";

import { getAuth } from "../better-auth/instance.js";
import { loadCatalog } from "../catalog/index.js";
import type { AuthBindings } from "../types/env.js";
import { buildAllowResponse, validateRequest } from "./contract.js";
import { evaluatePolicy, type OrgPermissionReader } from "./policy.js";
import { resolveSession } from "./session.js";

function errorResponse(
  code: "NO_CREDENTIAL" | "INVALID_SESSION" | "SESSION_EXPIRED" | "FORBIDDEN" | "BAD_AUTH_RESPONSE",
  message: string,
  requestId: string,
  status: number,
  renewalCookies: readonly string[] = [],
): Response {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  for (const c of renewalCookies) headers.append("Set-Cookie", c);
  return new Response(JSON.stringify({ code, message, requestId }), { status, headers });
}

function allowHeaders(cookies: readonly string[]): Headers {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return headers;
}

/**
 * POST /_internal/v1/authorize — binding-only.
 *
 * 1. Validate the request body (incl. known-permission check).
 * 2. Resolve the session through Better Auth.
 * 3. 401 when invalid/expired. 4. Evaluate policy. 5. 403 on deny.
 * 6. 200 + AuthorizeAllow on success. 7. Renewal Set-Cookie preserved on
 *    allow AND deny via getSetCookie().
 *
 * Never includes the complete session token, password, or credential value
 * in a JSON response.
 */
export async function authorizeHandler(
  request: Request,
  env: AuthBindings,
  orgReaderFactory: (auth: ReturnType<typeof getAuth>) => OrgPermissionReader,
): Promise<Response> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    rawBody = null;
  }
  const body = validateRequest(rawBody);
  if (body === null) {
    return errorResponse("BAD_AUTH_RESPONSE", "Malformed authorize request", "unknown", 400);
  }

  let catalog: PermissionCatalog;
  try {
    catalog = loadCatalog(env);
  } catch (err) {
    return errorResponse(
      "FORBIDDEN",
      `Catalog unavailable: ${err instanceof Error ? err.message : "error"}`,
      body.requestId,
      403,
    );
  }

  // COMPATIBILITY GATE [B-01]: getAuth() fails closed until the pinned
  // instance wiring is verified and enabled.
  const auth = getAuth(env);

  // COMPATIBILITY GATE [B-06]: renewal cookie capture requires the verified
  // returnHeaders/asResponse behavior; see docs/compatibility/gate-status.md.
  const session = await resolveSession(auth, request.headers);
  if (session === null) {
    return errorResponse("INVALID_SESSION", "No valid session", body.requestId, 401);
  }
  const reader = body.policy.kind === "organization-permission" ? orgReaderFactory(auth) : null;
  const decision = await evaluatePolicy(body.policy, session, reader, catalog);
  if (decision.kind === "deny") {
    return errorResponse(decision.code, "Authorization denied", body.requestId, 403, session.renewalCookies);
  }

  const organizationId =
    body.policy.kind === "organization-permission" ? body.policy.organizationId : undefined;

  const allow = buildAllowResponse(
    body.requestId,
    session.userId,
    session.sessionId,
    session.userId,
    session.expiresAt,
    organizationId,
  );
  return new Response(JSON.stringify(allow), { status: 200, headers: allowHeaders(session.renewalCookies) });
}
