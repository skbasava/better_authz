import type { PermissionCatalog, PolicyRequest } from "@gateway/shared";

import { assertKnownPermissions, UnknownPermissionError } from "../catalog/index.js";
import type { ResolvedSession } from "./session.js";

export type PolicyDecision =
  | { readonly kind: "allow" }
  | { readonly kind: "deny"; readonly code: "FORBIDDEN" };

/**
 * Reads the caller's effective permission set in one organization.
 * Implemented against the pinned Better Auth organization plugin (GATE B-03).
 * Returns null when the user is not a member — the policy then denies.
 */
export interface OrgPermissionReader {
  readonly getMembershipPermissions: (input: {
    readonly organizationId: string;
    readonly userId: string;
  }) => Promise<readonly string[] | null>;
}

/**
 * COMPATIBILITY GATE [B-03]:
 * - The organization-plugin API used to resolve membership -> role ->
 *   permission set is not verified against pinned 1.7.10.
 * - Do not implement against an assumed API; record the verified call in
 *   docs/compatibility/gate-status.md first.
 */
export function createBetterAuthOrgReader(
  _auth: unknown, // AuthInstance, gated
): OrgPermissionReader {
  throw new Error(
    "COMPATIBILITY GATE [B-03]: organization-plugin permission resolution not enabled",
  );
}

export async function evaluatePolicy(
  policy: PolicyRequest,
  session: ResolvedSession,
  reader: OrgPermissionReader | null,
  catalog: PermissionCatalog,
): Promise<PolicyDecision> {
  switch (policy.kind) {
    case "signed-in":
      return { kind: "allow" };

    case "global-role": {
      // Platform roles never grant implicit organization access (§10.9).
      if (session.platformRole === null) return { kind: "deny", code: "FORBIDDEN" };
      return policy.allowedRoles.includes(session.platformRole)
        ? { kind: "allow" }
        : { kind: "deny", code: "FORBIDDEN" };
    }

    case "organization-permission": {
      if (reader === null) return {kind: "deny", code: "FORBIDDEN"};

      // Fail closed on unknown names before any membership lookup (§10.28).
      try {
        assertKnownPermissions(policy.allOf, catalog);
      } catch (err) {
        if (err instanceof UnknownPermissionError) return { kind: "deny", code: "FORBIDDEN" };
        throw err;
      }
      const granted = await reader.getMembershipPermissions({
        organizationId: policy.organizationId,
        userId: session.userId,
      });
      if (granted === null) return { kind: "deny", code: "FORBIDDEN" };
      try {
        assertKnownPermissions(granted, catalog);
      } catch (err) {
        // A role containing names the current catalog doesn't know must not
        // be reinterpreted — deny (catalog rollout skew, Review Focus 4).
        if (err instanceof UnknownPermissionError) return { kind: "deny", code: "FORBIDDEN" };
        throw err;
      }
      return policy.allOf.every((p) => granted.includes(p))
        ? { kind: "allow" }
        : { kind: "deny", code: "FORBIDDEN" };
    }
  }
}
