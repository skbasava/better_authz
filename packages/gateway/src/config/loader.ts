import type { CompactSchema, GatewayConfig, OrganizationIdSource, PermissionCatalog, RouteRule, TenantHost } from "@gateway/shared";

export class GatewayConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GatewayConfigError";
  }
}

const PERMISSION_NAME = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/;
const ORG_ID_SOURCE_PATH = /^path\.[A-Za-z][A-Za-z0-9_]*$/;
const ORG_ID_SOURCE_CONST = /^const\.[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

function fail(message: string): never {
  throw new GatewayConfigError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveIntAtMost(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= max;
}

function expectString(value: unknown, what: string): string {
  if (typeof value !== "string" || value === "") fail(`${what} must be a non-empty string`);
  return value;
}

/** catalogPermissionNames() from the spec sketch, kept out of shared (types-only). */
function catalogNames(catalog: PermissionCatalog): Set<string> {
  return new Set(catalog.permissions.map((p) => p.name));
}

export function validateCatalog(raw: unknown): PermissionCatalog {
  if (!isRecord(raw)) fail("catalog must be an object");
  if (!isPositiveIntAtMost(raw.version, Number.MAX_SAFE_INTEGER)) {
    fail("catalog.version must be a positive integer");
  }
  if (!Array.isArray(raw.permissions)) fail("catalog.permissions must be an array");
  const seen = new Set<string>();
  const permissions: { name: string; description?: string }[] = [];
  for (const entry of raw.permissions) {
    if (!isRecord(entry)) fail("catalog permission must be an object");
    const name = expectString(entry.name, "catalog permission name");
    if (!PERMISSION_NAME.test(name)) fail(`invalid catalog permission name: ${name}`);
    if (seen.has(name)) fail(`duplicate catalog permission name: ${name}`);
    seen.add(name);
    if (entry.description !== undefined) {
      permissions.push({
        name,
        description: expectString(entry.description, "catalog permission description"),
      });
    } else {
      permissions.push({ name });
    }
  }
  return { version: raw.version, permissions };
}

function validateOrigin(raw: unknown): GatewayConfig["origins"][number] {
  if (!isRecord(raw)) fail("origin must be an object");
  const id = expectString(raw.id, "origin.id");
  const url = expectString(raw.url, `origin(${id}).url`);
  if (!url.startsWith("https://") || url.endsWith("/")) {
    fail(`origin(${id}).url must be an https:// base URL with no trailing slash`);
  }
  const secretEnvVar = expectString(raw.secretEnvVar, `origin(${id}).secretEnvVar`);
  if (!/^[A-Z][A-Z0-9_]*$/.test(secretEnvVar)) {
    fail(`origin(${id}).secretEnvVar must be an environment-variable-style name`);
  }
  if (!isPositiveIntAtMost(raw.deadlineMs, 30_000)) {
    fail(`origin(${id}).deadlineMs must be a positive integer <= 30000`);
  }
  return { id, url, secretEnvVar, deadlineMs: raw.deadlineMs };
}

function pathParamsOf(path: string): Set<string> {
  const names = new Set<string>();
  for (const part of path.split("/")) {
    if (part.startsWith(":")) names.add(part.slice(1));
  }
  return names;
}

function validatePath(path: unknown, what: string): string {
  const value = expectString(path, what);
  if (!value.startsWith("/")) fail(`${what} must start with /`);
  if (value.includes("//")) fail(`${what} must not contain repeated slashes`);
  return value;
}

function validatePolicy(
  raw: unknown,
  ruleId: string,
  params: Set<string>,
  known: Set<string>,
): RouteRule["policy"] {
  if (!isRecord(raw)) fail(`route(${ruleId}).policy must be an object`);
  switch (raw.kind) {
    case "public":
    case "signed-in":
    case "app-access":
      return { kind: raw.kind };
    case "global-role": {
      if (!Array.isArray(raw.allowedRoles) || raw.allowedRoles.length === 0) {
        fail(`route(${ruleId}).allowedRoles must be a non-empty array`);
      }
      const allowedRoles = raw.allowedRoles.map((r) =>
        expectString(r, `route(${ruleId}).allowedRoles[]`),
      );
      return { kind: "global-role", allowedRoles };
    }
    case "organization-permission": {
      const orgSource = expectString(raw.organizationIdFrom, `route(${ruleId}).organizationIdFrom`);
      if (orgSource === "host.tenant") {
	   // Shared-gateway tenant hostname: org resolved from the tenantHosts
        // registry at request time — validated there, never from the client.
      } else if (ORG_ID_SOURCE_CONST.test(orgSource)) {
        // Fixed org (dedicated per-org gateway): validated grammar, no path param needed.
      } else if (ORG_ID_SOURCE_PATH.test(orgSource)) {
        const paramName = orgSource.slice("path.".length);
        if (!params.has(paramName)) {
          fail(`route(${ruleId}).organizationIdFrom references unknown path param :${paramName}`);
        }
      } else {
        fail(`route(${ruleId}).organizationIdFrom must have format path.paramName or const.orgId`);
      }
      if (!Array.isArray(raw.allOf) || raw.allOf.length === 0) {
        fail(`route(${ruleId}).allOf must be a non-empty array`);
      }
      const allOf = raw.allOf.map((p) => {
        const name = expectString(p, `route(${ruleId}).allOf[]`);
        if (!PERMISSION_NAME.test(name)) fail(`route(${ruleId}).allOf: invalid permission name ${name}`);
        if (!known.has(name)) fail(`route(${ruleId}).allOf: unknown catalog permission ${name}`);
        return name;
      });
      return { kind: "organization-permission", organizationIdFrom: orgSource as OrganizationIdSource , allOf };
    }
    default:
      fail(`route(${ruleId}).policy.kind is missing or unsupported`);
  }
}

const SCHEMA_TYPES = new Set(["object", "array", "string", "number", "integer", "boolean", "null"]);

function isCompactSchema(raw: unknown): raw is CompactSchema {
  if (!isRecord(raw)) return false;
  if (raw.type !== undefined && (typeof raw.type !== "string" || !SCHEMA_TYPES.has(raw.type))) return false;
  if (raw.required !== undefined && (!Array.isArray(raw.required) || !raw.required.every((r) => typeof r === "string"))) return false;
  if (raw.properties !== undefined) {
    if (!isRecord(raw.properties)) return false;
    for (const v of Object.values(raw.properties)) if (!isCompactSchema(v)) return false;
  }
  if (raw.items !== undefined && !isCompactSchema(raw.items)) return false;
  if (raw.enum !== undefined && !Array.isArray(raw.enum)) return false;
  return true;
}

function validateRoute(raw: unknown, known: Set<string>): RouteRule {
  if (!isRecord(raw)) fail("route must be an object");
  const id = expectString(raw.id, "route.id");
  const path = validatePath(raw.path, `route(${id}).path`);
  if (path === "/api/auth" || path.startsWith("/api/auth/")) {
    fail(`route(${id}).path overlaps reserved /api/auth namespace`);
  }
  if (path.startsWith("/_internal/")) {
    fail(`route(${id}).path must not start with /_internal/`);
  }
  //const destinationPath = validatePath(raw.destinationPath, `route(${id}).destinationPath`);
  const destinationPath =
    raw.destinationPath === "@identity"
      ? "@identity"
      : validatePath(raw.destinationPath, `route(${id}).destinationPath`);

  let rule: RouteRule = {
    id,
    path,
    originId: expectString(raw.originId, `route(${id}).originId`),
    destinationPath,
    method:
      typeof raw.method === "string"
        ? raw.method.toUpperCase()
        : Array.isArray(raw.method) && raw.method.length > 0
          ? raw.method.map((m) => expectString(m, `route(${id}).method[]`).toUpperCase())
          : fail(`route(${id}).method must be a method or non-empty array`),
    policy: validatePolicy(raw.policy, id, pathParamsOf(path), known),
  };

  if (raw.host !== undefined) rule = { ...rule, host: expectString(raw.host, `route(${id}).host`) };
  if (raw.deadlineMs !== undefined) {
    if (!isPositiveIntAtMost(raw.deadlineMs, 30_000)) fail(`route(${id}).deadlineMs must be a positive integer <= 30000`);
    rule = { ...rule, deadlineMs: raw.deadlineMs };
  }
  if (raw.maxBodyBytes !== undefined) {
    if (!isPositiveIntAtMost(raw.maxBodyBytes, Number.MAX_SAFE_INTEGER)) {
      fail(`route(${id}).maxBodyBytes must be a positive integer`);
    }
    rule = { ...rule, maxBodyBytes: raw.maxBodyBytes };
  }
  if (raw.cors !== undefined) {
    if (!isRecord(raw.cors) || !Array.isArray(raw.cors.allowedOrigins)) {
      fail(`route(${id}).cors must be an object with allowedOrigins array`);
    }
    rule = {
      ...rule,
      cors: {
        allowedOrigins: raw.cors.allowedOrigins.map((o) =>
          expectString(o, `route(${id}).cors.allowedOrigins[]`),
        ),
        allowCredentials: raw.cors.allowCredentials === true,
      },
    };
  }

  if (raw.audience !== undefined) {
    const audience = expectString(raw.audience, `route(${id}).audience`);
    if (!/^[a-z][a-z0-9_-]{0,31}$/.test(audience)) {
      fail(`route(${id}).audience must be a short lowercase identifier`);
    }
    rule = { ...rule, audience };
  }
  if (raw.policyChain !== undefined) {
    if (
      !Array.isArray(raw.policyChain) ||
      raw.policyChain.length === 0 ||
      !raw.policyChain.every((p) => typeof p === "string" && p !== "")
    ) {
      fail(`route(${id}).policyChain must be a non-empty array of policy names`);
    }
    rule = { ...rule, policyChain: raw.policyChain };
  }
  if (raw.requestValidation !== undefined) {
    const rv = raw.requestValidation;
    if (!isRecord(rv) || (rv.mode !== "reject" && rv.mode !== "log") || !isCompactSchema(rv.schema)) {
      fail(`route(${id}).requestValidation must be { mode: "reject"|"log", schema: CompactSchema }`);
    }
    rule = { ...rule, requestValidation: { mode: rv.mode, schema: rv.schema } };
  }

  if (raw.allowRedirects === true) rule = { ...rule, allowRedirects: true };
  return rule;
}

/**
 * Validate raw configuration at Worker initialization.
 * Throws GatewayConfigError with the first invalid rule found.
 */
export function validateRouteConfig(raw: unknown, catalog: PermissionCatalog): GatewayConfig {
  if (!isRecord(raw)) fail("config must be an object");
  if (!Array.isArray(raw.origins) || raw.origins.length === 0) fail("config.origins must be a non-empty array");
  if (!Array.isArray(raw.routes) || raw.routes.length === 0) fail("config.routes must be a non-empty array");

  const origins = raw.origins.map(validateOrigin);
  const originIds = new Set(origins.map((o) => o.id));
  if (originIds.size !== origins.length) fail("origin ids must be unique");

  const known = catalogNames(catalog);
  const routes = raw.routes.map((r) => validateRoute(r, known));
  const routeIds = new Set<string>();
  for (const route of routes) {
    if (routeIds.has(route.id)) fail(`duplicate route id: ${route.id}`);
    routeIds.add(route.id);
    if (!originIds.has(route.originId)) {
      fail(`route(${route.id}).originId references unknown origin ${route.originId}`);
    }
  }

  let tenantHosts: readonly TenantHost[] | undefined;
  if (raw.tenantHosts !== undefined) {
    if (!Array.isArray(raw.tenantHosts)) fail("config.tenantHosts must be an array");
    const seen = new Set<string>();
    const list: TenantHost[] = [];
    for (const entry of raw.tenantHosts) {
      if (!isRecord(entry)) fail("tenantHosts entry must be an object");
      const hostname = expectString(entry.hostname, "tenantHosts.hostname");
      const audience = expectString(entry.audience, "tenantHosts.audience");
      const organizationId = expectString(entry.organizationId, "tenantHosts.organizationId");
      if (!/^[a-z0-9.-]+$/i.test(hostname)) fail(`invalid tenant hostname: ${hostname}`);
      if (!/^[a-z][a-z0-9_-]{0,31}$/.test(audience)) fail(`invalid tenant audience: ${audience}`);
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(organizationId)) fail(`invalid tenant organizationId: ${organizationId}`);
      if (seen.has(hostname)) fail(`duplicate tenant hostname: ${hostname}`);
      seen.add(hostname);
      list.push({ hostname, audience, organizationId });
    }
    tenantHosts = list;
  }
  return tenantHosts === undefined ? { origins, routes } : { origins, routes, tenantHosts };
}
