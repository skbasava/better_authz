/**
 * Better Auth adapter — the ONLY module permitted to import better-auth.
 * Owns: SessionResolver (wraps getSession), and (gated B-03) the
 * Membership/Role resolvers against the organization plugin's API.
 * ApplicationResolver is D1-native (our own SQL on the authority's DB) and
 * needs no better-auth API.
 */
import { getAuth } from "./instance.js";
import { resolveSession } from "../authorize/session.js";
import type {
  ApplicationResolver,
  MembershipResolver,
  RoleResolver,
  SessionResolver,
} from "../authorize/ports.js";
import type { AuthBindings } from "../types/env.js";

export function createBetterAuthSessionResolver(env: AuthBindings): SessionResolver {
  const auth = getAuth(env);
  return { resolve: (headers: Headers) => resolveSession(auth, headers) };
}

/** Read `app` attribution from organization metadata (string JSON or object). */
function metadataApp(metadata: unknown): string | null {
  if (typeof metadata === "string") {
    try {
      return metadataApp(JSON.parse(metadata));
    } catch {
      return null;
    }
  }
  if (typeof metadata === "object" && metadata !== null) {
    const app = (metadata as { app?: unknown }).app;
    return typeof app === "string" && app !== "" ? app : null;
  }
  return null;
}

/**
 * Layer-2 resolver backed by the authority's own D1. Org attribution:
 * organization.metadata.app = audience, stamped at org creation by the
 * gateway's audience (provisioning convention — see design doc §5).
 */
export function createD1ApplicationResolver(
  db: D1Database,
  knownAudiences: readonly string[],
): ApplicationResolver {
  return {
    resolveNamespace: async (audience) =>
      knownAudiences.includes(audience) ? audience : null,

    orgBelongsTo: async (organizationId, audience) => {
      const row = await db
        .prepare("SELECT metadata FROM organization WHERE id = ?")
        .bind(organizationId)
        .first();
      if (row === null) return false;
      return metadataApp(row.metadata) === audience;
    },

    hasAnyMembership: async (userId, audience) => {
      const row = await db
        .prepare(
          `SELECT 1 AS x FROM member m
             JOIN organization o ON o.id = m.organizationId
            WHERE m.userId = ? AND json_extract(o.metadata, '$.app') = ?
            LIMIT 1`,
        )
        .bind(userId, audience)
        .first();
      return row !== null;
    },
  };
}

/**
 * COMPATIBILITY GATE [B-03]:
 * - Verify the organization plugin's membership → role → permission API in
 *   pinned better-auth 1.7.10 (see gate-status.md checklist, items 1–7).
 * - Normalize better-auth's resource/action role shape into the dotted
 *   vocabulary at this boundary ONLY (invoice.read).
 * - Until verified: fail closed (deny), never guess.
 */
export function createBetterAuthMembershipResolver(_env: AuthBindings): MembershipResolver {
  throw new Error(
    "COMPATIBILITY GATE [B-03]: membership resolution not verified against pinned better-auth",
  );
}

export function createBetterAuthRoleResolver(_env: AuthBindings): RoleResolver {
  throw new Error(
    "COMPATIBILITY GATE [B-03]: role resolution not verified against pinned better-auth",
  );
}
