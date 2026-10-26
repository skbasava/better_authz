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
export type OrganizationIdSource = `path.${string}` | `const.${string}` | "host.tenant";

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

export type JsonSchemaType =
  | "object" | "array" | "string" | "number" | "integer" | "boolean" | "null";

/**
 * Compact JSON-Schema subset carried in route config and enforced at the
 * edge (schema-as-contract). Deliberately small: the compiler extracts it
 * from OpenAPI; hand-written configs use the same shape.
 */
export interface CompactSchema {
  readonly type?: JsonSchemaType;
  readonly required?: readonly string[];
  readonly properties?: Readonly<Record<string, CompactSchema>>;
  readonly items?: CompactSchema;
  readonly enum?: readonly (string | number | boolean | null)[];
  readonly additionalProperties?: boolean;
}

export interface RequestValidationConfig {
  /** reject: 400 on violation. log: forward anyway, log errors (rollout mode). */
  readonly mode: "reject" | "log";
  readonly schema: CompactSchema;
}

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
  /** Schema-as-contract body validation (request-validation policy). */
  readonly requestValidation?: RequestValidationConfig;
  /**
   * Optional ordered policy chain (ADDITIVE only — the mandatory security
   * core is runtime-constructed and never config-driven). Names resolve
   * against the built-in registry: "request-validation", ... .
   */
  readonly policyChain?: readonly string[];
  /**
   * Application audience for THIS route. On a shared multi-app gateway
   * (reference-architecture Router Worker pattern) each route carries its
   * app identity, overriding the gateway-level GATEWAY_AUDIENCE default.
   * The compiler enforces that organization-permission names on the route
   * are prefixed with the audience (cross-app isolation at build time).
   */
  readonly audience?: string;
}

/** A tenant hostname pinned on the shared gateway (Topology D-on-shared). */
export interface TenantHost {
  readonly hostname: string;
  readonly audience: string;
  readonly organizationId: string;
}

export interface GatewayConfig {
  readonly origins: readonly OriginConfig[];
  readonly routes: readonly RouteRule[];
  /** Hostname → (audience, org) registry; empty/absent when unused. */
  readonly tenantHosts?: readonly TenantHost[];
}

/** Catalog is validated alongside route config at gateway init. */
export interface ValidatedGatewayConfig {
  readonly config: GatewayConfig;
  readonly catalog: PermissionCatalog;
}
