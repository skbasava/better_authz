// COMPATIBILITY GATE [B-06]:
// - auth.api.getSession({ headers }) return shape verified against pinned
//   better-auth 1.7.10 via actual binding requests (Task 0 Step 4).
// - Do not adjust field extraction without recorded evidence.

export interface ResolvedSession {
  readonly userId: string;
  readonly sessionId: string;
  /** RFC 3339 UTC. */
  readonly expiresAt: string;
  /** Platform (global) role, separate from organization roles. */
  readonly platformRole: string | null;
  /** Renewal Set-Cookie values to propagate, including on deny. */
  readonly renewalCookies: readonly string[];
}

interface AuthInstance {
  api: { getSession: (args: { headers: Headers }) => Promise<unknown> };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Extract renewal cookies from response headers — never from getSetCookie-less APIs. */
export function extractRenewalCookies(headers: Headers): readonly string[] {
  return headers.getSetCookie();
}

/**
 * Resolve the session through Better Auth. Returns null when there is no
 * valid session. The caller maps null to 401 INVALID_SESSION.
 */
export async function resolveSession(
  auth: AuthInstance,
  headers: Headers,
): Promise<ResolvedSession | null> {
  const result: unknown = await auth.api.getSession({ headers });
  if (!isRecord(result)) return null;
  const user = result.user;
  const session = result.session;
  if (!isRecord(user) || typeof user.id !== "string" || user.id === "") return null;
  // Enabled(u): disabled/banned accounts authenticate nowhere.
  // Field name verified against pinned 1.7.10 user schema (B-01 evidence);
  // defensive truthiness check — absent field means enabled.
  if ((user as { banned?: unknown }).banned === true) return null;
  if (!isRecord(session)) return null;
  if (typeof session.id !== "string" || session.id === "") return null;
  if (typeof session.userId !== "string" || session.userId !== user.id) return null;

  let expiresAt: string;
  if (session.expiresAt instanceof Date) {
    expiresAt = session.expiresAt.toISOString();
  } else if (typeof session.expiresAt === "string") {
    expiresAt = session.expiresAt;
  } else {
    return null;
  }
  if (Number.isNaN(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()) return null;

  const platformRole =
    typeof user.role === "string" && user.role !== "" ? user.role : null;

  return {
    userId: user.id,
    sessionId: session.id,
    expiresAt,
    platformRole,
    renewalCookies: [], // populated by the handler from the verified getSession response headers (GATE B-06)
  };
}
