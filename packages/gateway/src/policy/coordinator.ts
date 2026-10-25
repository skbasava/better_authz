import type { PolicyConfig, PolicyRequest } from "@gateway/shared";

import { extractOrganizationId } from "../routing/params.js";

export type PolicyBuildResult =
  | { readonly kind: "policy"; readonly policy: PolicyRequest }
  | { readonly kind: "public" }
  /** Missing or invalid organization context — reject with 400 before authorization. */
  | { readonly kind: "invalid-organization-context" };

/**
 * Translate a route-declared policy plus matched path params into the
 * AuthorizeRequest policy. The client can never choose the policy.
 */
export function buildPolicy(
  config: PolicyConfig,
  params: ReadonlyMap<string, string>,
): PolicyBuildResult {
  switch (config.kind) {
    case "public":
      return { kind: "public" };
    case "signed-in":
      return { kind: "policy", policy: { kind: "signed-in" } };
    case "app-access":
      return { kind: "policy", policy: { kind: "app-access" } };
    case "global-role":
      return { kind: "policy", policy: { kind: "global-role", allowedRoles: config.allowedRoles } };
    case "organization-permission": {
      const organizationId = extractOrganizationId(config.organizationIdFrom, params);
      if (organizationId === null) return { kind: "invalid-organization-context" };
      return {
        kind: "policy",
        policy: { kind: "organization-permission", organizationId, allOf: config.allOf },
      };
    }
  }
}
