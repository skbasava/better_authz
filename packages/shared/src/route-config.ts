import type { PermissionCatalog } from "./catalog.js";

// ---------------------------------------------------------------------------
// Origin configuration
// ---------------------------------------------------------------------------

export interface OriginConfig {
  readonly id: string;
  /** https:// base URL, no trailing slash. */
  readonly url: string;
  /** Worker secret binding name providing the Gateway-Origin-Auth value. */
  readonly secretEnvVar: string;
  /** Default per-origin deadline; positive integer, at most 30000. */
  readonly deadlineMs: number;
}

// ---------------------------------------------------------------------------
// Policy configuration (route-declared). Note: unlike PolicyRequest, a route
// may be "public" — the gateway answers those locally without calling the
// Auth Worker.
// ---------------------------------------------------------------------------

// Organization ID source:
//   "path.organizationId" — org from the route's declared path parameter (shared gateway)
//   "const.org_acme_erp"  — org fixed at config time (dedicated per-org gateway)
export type OrganizationIdSource = `path.${string}` | `const.${string}`;

export type PolicyConfig =
  | { readonly kind: "public" }
  | { readonly kind: "signed-in" }
  | { readonly kind: "app-access" }
  | { readonly kind: "global-role"; readonly allowedRoles: readonly string[] }
  | {
      readonly kind: "organization-permission";
      readonly organizationIdFrom: OrganizationIdSource;
      readonly allOf: readonly string[];
    };

export interface CorsConfig {
  readonly allowedOrigins: readonly string[];
  readonly allowCredentials: boolean;
}

export interface RouteRule {
  readonly id: string;
  readonly host?: string;
  readonly method: string | readonly string[];
  /** e.g. "/api/orgs/:organizationId/invoices" */
  readonly path: string;
  readonly originId: string;
  /** e.g. "/v1/orgs/:organizationId/invoices" */
  readonly destinationPath: string;
  /** Overrides origin default; positive integer <= 30000. */
  readonly deadlineMs?: number;
  readonly maxBodyBytes?: number;
  readonly policy: PolicyConfig;
  readonly cors?: CorsConfig;
  /** G-02: permit backend redirects on this route. */
  readonly allowRedirects?: boolean;
}

export interface GatewayConfig {
  readonly origins: readonly OriginConfig[];
  readonly routes: readonly RouteRule[];
}

/** Catalog is validated alongside route config at gateway init. */
export interface ValidatedGatewayConfig {
  readonly config: GatewayConfig;
  readonly catalog: PermissionCatalog;
}
