/**
 * OpenAPI → GatewayConfig compiler (Phase 0).
 *
 * The deployed Worker keeps consuming today's RouteRule[] — this compiler
 * is a BUILD artifact. OpenAPI 3.1 documents describe routes; the
 * x-gateway-route vendor extension carries policy/origin/validation wiring;
 * x-gateway-public documents intentional public routes (lint gate).
 *
 * Matching semantics are NOT imported from Zuplo: route order in the OpenAPI
 * document is irrelevant to security (our matcher is shadow-free); the
 * compiler simply emits rules and the existing registry resolves them.
 */
import type {
  CompactSchema,
  GatewayConfig,
  PolicyConfig,
  RouteRule,
} from "@gateway/shared";

export interface CompileInput {
  readonly openapi: unknown;
  /** Declared origins (same shape as GatewayConfig.origins). */
  readonly origins: GatewayConfig["origins"];
  /** Optional tenant hostname registry (Topology D on the shared gateway). */
  readonly tenantHosts?: GatewayConfig["tenantHosts"];
}

interface OasRef {
  readonly $ref?: string;
  [key: string]: unknown;
}

function resolveRef(doc: unknown, node: unknown): unknown {
  let current = node;
  for (let depth = 0; depth < 32; depth += 1) {
    if (typeof current !== "object" || current === null) return current;
    const ref = (current as OasRef).$ref;
    if (typeof ref !== "string" || !ref.startsWith("#/")) return current;
    let target: unknown = doc;
    for (const part of ref.slice(2).split("/")) {
      if (typeof target !== "object" || target === null) return undefined;
      target = (target as Record<string, unknown>)[part];
    }
    current = target;
  }
  return undefined;
}

/** Translate an OpenAPI/JSON-Schema node into the CompactSchema subset. */
export function toCompactSchema(doc: unknown, node: unknown, depth = 0): CompactSchema | undefined {
  if (depth > 16) return undefined;
  const resolved = resolveRef(doc, node);
  if (typeof resolved !== "object" || resolved === null) return undefined;
  const s = resolved as Record<string, unknown>;

  const oneOf = s.oneOf ?? s.anyOf;
  if (Array.isArray(oneOf) && oneOf.length > 0) {
    return toCompactSchema(doc, oneOf[0], depth + 1); // subset: first variant
  }

  const out: Record<string, unknown> = {};
  if (typeof s.type === "string") out.type = s.type;
  if (Array.isArray(s.enum)) out.enum = s.enum;
  if (Array.isArray(s.required)) out.required = s.required.filter((r) => typeof r === "string");
  if (s.additionalProperties === false) out.additionalProperties = false;
  if (typeof s.items === "object" && s.items !== null) {
    const items = toCompactSchema(doc, s.items, depth + 1);
    if (items !== undefined) out.items = items;
  }
  if (typeof s.properties === "object" && s.properties !== null) {
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(s.properties as Record<string, unknown>)) {
      const cs = toCompactSchema(doc, v, depth + 1);
      if (cs !== undefined) props[k] = cs;
    }
    out.properties = props;
  }
  if (s.type === undefined && out.properties === undefined && out.items === undefined && out.enum === undefined) {
    return undefined;
  }
  return out as unknown as CompactSchema;
}

interface XGatewayRoute {
  readonly origin: string;
  readonly destinationPath: string;
  readonly policy: PolicyConfig;
  readonly cors?: RouteRule["cors"];
  readonly deadlineMs?: number;
  readonly maxBodyBytes?: number;
  readonly allowRedirects?: boolean;
  /** Set "reject"|"log" to attach requestBody JSON-schema validation. */
  readonly requestValidation?: "reject" | "log";
  /** Optional additive policy chain (built-in registry names). */
  readonly policyChain?: readonly string[];
  /** Per-route application audience (shared multi-app gateway). */
  readonly audience?: string;
}

function isXGatewayRoute(raw: unknown): raw is XGatewayRoute {
  if (typeof raw !== "object" || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.origin === "string" &&
    typeof r.destinationPath === "string" &&
    typeof r.policy === "object" &&
    r.policy !== null
  );
}

export interface CompileResult {
  readonly config: GatewayConfig;
  readonly warnings: readonly string[];
}

export function compileOpenapi(input: CompileInput): CompileResult {
  const doc = input.openapi;
  const warnings: string[] = [];
  const routes: RouteRule[] = [];

  const paths = (doc as { paths?: Record<string, unknown> }).paths ?? {};
  // Multi-file merging sorts path keys alphabetically (documented convention);
  // within a file, object key order applies. Security-relevant resolution
  // remains order-independent in the runtime matcher.
  for (const path of Object.keys(paths).sort()) {
    const item = paths[path];
    if (typeof item !== "object" || item === null) continue;
    for (const [method, op] of Object.entries(item)) {
      if (method === "parameters" || typeof op !== "object" || op === null) continue;
      const operation = op as Record<string, unknown>;
      const x = operation["x-gateway-route"];
      if (x === undefined) continue;
      if (!isXGatewayRoute(x)) {
        warnings.push(`${method.toUpperCase()} ${path}: invalid x-gateway-route, skipped`);
        continue;
      }

      let requestValidation: RouteRule["requestValidation"];
      if (x.requestValidation !== undefined) {
        const body = resolveRef(doc, operation.requestBody) as Record<string, unknown> | undefined;
        const content = (body?.content ?? {}) as Record<string, unknown>;
        const json = content["application/json"] as Record<string, unknown> | undefined;
        const schema = toCompactSchema(doc, json?.schema);
        if (schema === undefined) {
          warnings.push(`${method.toUpperCase()} ${path}: requestValidation requested but no JSON schema found`);
        } else {
          requestValidation = { mode: x.requestValidation, schema };
        }
      }

      // OpenAPI path templating {id} → our :id
      const routePath = path.replace(/\{([^}]+)\}/g, ":$1");
      const destPath = x.destinationPath.replace(/\{([^}]+)\}/g, ":$1");

      const rule: RouteRule = {
        id:
          typeof operation.operationId === "string" && operation.operationId !== ""
            ? operation.operationId
            : `${method}-${path}`,
        method: method.toUpperCase(),
        path: routePath,
        originId: x.origin,
        destinationPath: destPath,
        policy: x.policy,
      };
      const withCors: RouteRule = x.cors === undefined ? rule : { ...rule, cors: x.cors };
      const withDeadline: RouteRule = x.deadlineMs === undefined ? withCors : { ...withCors, deadlineMs: x.deadlineMs };
      const withBody: RouteRule = x.maxBodyBytes === undefined ? withDeadline : { ...withDeadline, maxBodyBytes: x.maxBodyBytes };
      const withRedirects: RouteRule = x.allowRedirects === true ? { ...withBody, allowRedirects: true } : withBody;
      const withChain: RouteRule =
        x.policyChain === undefined ? withRedirects : { ...withRedirects, policyChain: x.policyChain };
      const withAudience: RouteRule =
        x.audience === undefined ? withChain : { ...withChain, audience: x.audience };
      routes.push(
        requestValidation === undefined ? withAudience : { ...withAudience, requestValidation },
      );
    }
  }

  return {
    config:
      input.tenantHosts === undefined
        ? { origins: input.origins, routes }
        : { origins: input.origins, routes, tenantHosts: input.tenantHosts },
    warnings,
  };
}

/** Remove x-gateway-* vendor extensions — emits a clean spec for portals/SDKs. */
export function stripExtensions(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripExtensions);
  if (typeof node === "object" && node !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (k.startsWith("x-gateway-")) continue;
      out[k] = stripExtensions(v);
    }
    return out;
  }
  return node;
}
