import type { PermissionCatalog, PolicyRequest } from "@gateway/shared";

import { assertKnownPermissions, UnknownPermissionError } from "../catalog/index.js";
import type { DenyLayer, MembershipResolver, PolicyPorts, RoleResolver } from "./ports.js";
import type { ResolvedSession } from "./session.js";

export type PolicyDecision =
  | { readonly kind: "allow" }
  | { readonly kind: "deny"; readonly code: "FORBIDDEN"; readonly layer: DenyLayer };

export function deny(layer: DenyLayer): PolicyDecision {
  return { kind: "deny", code: "FORBIDDEN", layer };
}

/**
 * Four-dimensional evaluation (design doc §4):
 *   Allow(u,a,o,p) = Authenticated(u) ∧ Enabled(u) — resolved upstream
 *                  ∧ AppEnabled(o,a) ∧ AppMember(u,o,a)   ← layer 2 (ports.application)
 *                  ∧ HasPermission(u,o,a,p)              ← layer 3 (ports.membership + catalog)
 * Layers are deny-tagged so the audit log can distinguish
 * "no product access" from "not an org member" from "missing permission".
 */
export async function evaluatePolicy(
  policy: PolicyRequest,
  session: ResolvedSession,
  ports: PolicyPorts,
  catalog: PermissionCatalog,
): Promise<PolicyDecision> {
  switch (policy.kind) {
    case "signed-in":
      // Layer 1 only: a valid, enabled session is sufficient.
      return { kind: "allow" };

    case "app-access": {
      // Layer 2: known audience + at least one membership in an org of it.
      if ((await ports.application.resolveNamespace(ports.audience)) === null) {
        return deny("app");
      }
      return (await ports.application.hasAnyMembership(session.userId, ports.audience))
        ? { kind: "allow" }
        : deny("app");
    }

    case "global-role": {
      // Platform roles never grant implicit org access (§10.9).
      if (session.platformRole === null) return deny("permission");
      return policy.allowedRoles.includes(session.platformRole)
        ? { kind: "allow" }
        : deny("permission");
    }

    case "organization-permission": {
      // Layer-2 precondition: the requested org must belong to the asking
      // app. This closes the cross-app confused-deputy class entirely.
      if (!(await ports.application.orgBelongsTo(policy.organizationId, ports.audience))) {
        return deny("app");
      }
      if (ports.membership === null) return deny("membership");

      try {
        assertKnownPermissions(policy.allOf, catalog);
      } catch (err) {
        if (err instanceof UnknownPermissionError) return deny("permission");
        throw err;
      }
      const granted = await ports.membership.getMembershipPermissions({
        organizationId: policy.organizationId,
        userId: session.userId,
      });
      if (granted === null) return deny("membership");
      try {
        assertKnownPermissions(granted, catalog);
      } catch (err) {
        // A stored role containing names outside the current catalog must
        // not be reinterpreted — deny (catalog rollout skew, §10.28).
        if (err instanceof UnknownPermissionError) return deny("permission");
        throw err;
      }
      return policy.allOf.every((p) => granted.includes(p))
        ? { kind: "allow" }
        : deny("permission");
    }
  }
}

export type { MembershipResolver, RoleResolver };
