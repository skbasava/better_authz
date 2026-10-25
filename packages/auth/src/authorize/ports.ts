/**
 * Authorization ports — the seam between the decision logic and the
 * authority's data sources. NOTHING outside src/better-auth/** may import
 * better-auth; these interfaces are the only dependency. A better-auth
 * upgrade must produce a diff in exactly one directory (B-03 re-verification
 * checklist applies per upgrade).
 */

import type { ResolvedSession } from "./session.js";

/** Layer 1: who is the user (and are they enabled?). */
export interface SessionResolver {
  readonly resolve: (headers: Headers) => Promise<ResolvedSession | null>;
}

/** Layer 2: application access — audience validity and app-org attribution. */
export interface ApplicationResolver {
  /** null = unknown audience (fail closed). */
  readonly resolveNamespace: (audience: string) => Promise<string | null>;
  /** AppEnabled(o,a) ∧ namespace check: does this org belong to this app? */
  readonly orgBelongsTo: (organizationId: string, audience: string) => Promise<boolean>;
  /** AppMember at layer 2: any membership in an org attributed to this app. */
  readonly hasAnyMembership: (userId: string, audience: string) => Promise<boolean>;
}

/** Layer 3: membership → dotted permission set; null = not a member. */
export interface MembershipResolver {
  readonly getMembershipPermissions: (input: {
    readonly organizationId: string;
    readonly userId: string;
  }) => Promise<readonly string[] | null>;
}

/** Role definitions, normalized to the dotted vocabulary (invoice.read). */
export interface RoleDefinition {
  readonly name: string;
  readonly permissions: readonly string[];
}

/** B-03: role lifecycle (drift detection, template seeding) — gated. */
export interface RoleResolver {
  readonly listRoles: (organizationId: string) => Promise<readonly RoleDefinition[]>;
}

export type DenyLayer = "authn" | "app" | "membership" | "permission";

export interface AuthorizationEvent {
  readonly requestId: string;
  readonly userId: string | null;
  readonly audience: string;
  readonly organizationId?: string;
  readonly permissions?: readonly string[];
  readonly decision: "allow" | "deny";
  readonly layer: DenyLayer;
  readonly timestamp: string;
}

export interface AuditEmitter {
  readonly emit: (event: AuthorizationEvent) => void;
}

/** Everything evaluatePolicy needs — better-auth types never appear here. */
export interface PolicyPorts {
  readonly audience: string;
  readonly application: ApplicationResolver;
  /** null for policies that don't need membership (signed-in, app-access). */
  readonly membership: MembershipResolver | null;
}
