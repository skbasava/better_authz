import type { PermissionCatalog } from "@gateway/shared";

import { createD1ApplicationResolver } from "../better-auth/adapter.js";
import { getAuth } from "../better-auth/instance.js";
import { createConsoleAuditEmitter } from "./audit.js";
import { loadCatalog } from "../catalog/index.js";
import type { AuthBindings } from "../types/env.js";
import { buildAllowResponse, validateRequest } from "./contract.js";
import { evaluatePolicy, type MembershipResolver } from "./policy.js";
import type { PolicyPorts } from "./ports.js";
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

function knownAudiences(env: AuthBindings): readonly string[] {
  return env.KNOWN_AUDIENCES.split(",").map((s) => s.trim()).filter((s) => s !== "");
}

/**
 * POST /_internal/v1/authorize — binding-only authorization endpoint.
 *
 * Layered evaluation (design doc §4):
 *   1. Validate contract (incl. audience — Amendment A1).
 *   2. Layer 1: resolve session via Better Auth (∅ → 401, layer "authn").
 *   3. Layers 2–4: evaluatePolicy over ports (app → membership → permission).
 *   4. Emit an audit event for EVERY decision (allow and deny).
 *   5. 200 + AuthorizeAllow / 403 FORBIDDEN. Renewal cookies preserved on
 *      both paths via getSetCookie() (GATE B-06: capture still a stub).
 */
export async function authorizeHandler(
  request: Request,
  env: AuthBindings,
  orgReaderFactory: (auth: ReturnType<typeof getAuth>) => MembershipResolver,
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

  const audit = createConsoleAuditEmitter();

  let catalog: PermissionCatalog;
  try {
    catalog = loadCatalog(env);
  } catch {
    return errorResponse("FORBIDDEN", "Catalog unavailable", body.requestId, 403);
  }

  // COMPATIBILITY GATE [B-01]: getAuth() fails closed until verified.
  const auth = getAuth(env);

  const session = await resolveSession(auth, request.headers);
  if (session === null) {
    audit.emit({
      requestId: body.requestId,
      userId: null,
      audience: body.audience,
      decision: "deny",
      layer: "authn",
      timestamp: new Date().toISOString(),
    });
    return errorResponse("INVALID_SESSION", "No valid session", body.requestId, 401);
  }

  const ports: PolicyPorts = {
    audience: body.audience,
    application: createD1ApplicationResolver(env.DB, knownAudiences(env)),
    // Membership is resolved lazily: only org policies need it (B-03 gated).
    membership:
      body.policy.kind === "organization-permission" ? orgReaderFactory(auth) : null,
  };

  const decision = await evaluatePolicy(body.policy, session, ports, catalog);

  audit.emit({
    requestId: body.requestId,
    userId: session.userId,
    audience: body.audience,
    ...(body.policy.kind === "organization-permission"
      ? { organizationId: body.policy.organizationId }
      : {}),
    ...(body.policy.kind === "organization-permission" ? { permissions: body.policy.allOf } : {}),
    decision: decision.kind,
    layer: decision.kind === "deny" ? decision.layer : "permission",
    timestamp: new Date().toISOString(),
  });

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
