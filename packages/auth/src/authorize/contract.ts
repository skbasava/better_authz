import type { AuthorizeAllow, AuthorizeRequestBody, PolicyRequest } from "@gateway/shared";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isPolicyRequest(raw: unknown): raw is PolicyRequest {
  if (!isRecord(raw) || typeof raw.kind !== "string") return false;
  switch (raw.kind) {
    case "signed-in":
    case "app-access":
      return true;
    case "global-role":
      return (
        Array.isArray(raw.allowedRoles) &&
        raw.allowedRoles.length > 0 &&
        raw.allowedRoles.every((r) => typeof r === "string" && r !== "")
      );
    case "organization-permission":
      return (
        typeof raw.organizationId === "string" &&
        raw.organizationId !== "" &&
        Array.isArray(raw.allOf) &&
        raw.allOf.length > 0 &&
        raw.allOf.every((p) => typeof p === "string" && p !== "")
      );
    default:
      return false;
  }
}

/**
 * Validate the authorize request body. Returns null when malformed.
 * `audience` defaults to "default" when absent — transitional leniency for
 * pre-audience deployments; the gateway should always send its configured
 * GATEWAY_AUDIENCE (Amendment A1).
 */
export function validateRequest(raw: unknown): AuthorizeRequestBody | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.requestId !== "string" || raw.requestId === "") return null;
  const audience =
    typeof raw.audience === "string" && raw.audience !== "" ? raw.audience : "default";
  if (!isPolicyRequest(raw.policy)) return null;
  return { requestId: raw.requestId, audience, policy: raw.policy };
}

/** Build a contract-conformant allow response. Never includes credential material. */
export function buildAllowResponse(
  requestId: string,
  userId: string,
  sessionId: string,
  sessionUserId: string,
  expiresAt: string,
  organizationId?: string,
): AuthorizeAllow {
  const base = {
    contractVersion: 1,
    decision: "allow",
    user: { id: userId },
    session: { id: sessionId, userId: sessionUserId, expiresAt },
  } as const;
  return organizationId === undefined ? base : { ...base, organizationId };
}
