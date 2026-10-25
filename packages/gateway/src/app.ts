import { Hono } from "hono";

import type { AuthorizeRequestBody, RouteRule } from "@gateway/shared";

import { validateCatalog } from "./config/loader.js";
import type { GatewayRegistry } from "./config/registry.js";
import { buildRegistry } from "./config/registry.js";
import { extractCredential } from "./credential/adapter.js";
import { gatewayError } from "./errors/responses.js";
import { buildPolicy } from "./policy/coordinator.js";
import { canonicalizePath } from "./routing/canonicalize.js";
import type { MethodNotAllowed, RouteMatch } from "./routing/matcher.js";
import { buildDestinationPath } from "./routing/params.js";
import { createRateLimitMiddleware } from "./rate-limit/middleware.js";
import { callAuthorize, type AuthorizeOutcome } from "./session/client.js";
import { stripInboundHeaders } from "./proxy/sanitize.js";
import { forwardToOrigin } from "./proxy/forwarder.js";
import { forwardAuthRequest } from "./routes/auth-proxy.js";
import type { GatewayBindings, GatewayEnv } from "./types/env.js";
import type { AuthorizeAllow } from "@gateway/shared";

const DEFAULT_AUTH_DEADLINE_MS = 2_000;
const DEFAULT_RATE_LIMIT = { limit: 120, windowMs: 60_000 };
const DEFAULT_AUTH_RATE_LIMIT = { limit: 20, windowMs: 60_000 };
const HEALTH_PATH = "/healthz";
const AUTH_PREFIX = "/api/auth";

/** Per-environment registry cache — never shares config across envs/tests. */
const bootCache = new WeakMap<GatewayBindings, { registry: GatewayRegistry; cookieNames: readonly string[] }>();

function boot(env: GatewayBindings): { registry: GatewayRegistry; cookieNames: readonly string[] } {
  let cached = bootCache.get(env);
  if (cached === undefined) {
    const catalog = validateCatalog(JSON.parse(env.PERMISSION_CATALOG) as unknown);
    const registry = buildRegistry(JSON.parse(env.GATEWAY_CONFIG) as unknown, catalog);
    const cookieNames = env.SESSION_COOKIE_NAMES.split(",").map((s) => s.trim()).filter((s) => s !== "");
    cached = { registry, cookieNames };
    bootCache.set(env, cached);
  }
  return cached;
}

function readOriginSecret(env: GatewayBindings, secretEnvVar: string): string | null {
  const value = env[secretEnvVar];
  return typeof value === "string" && value !== "" ? value : null;
}

function readIntEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isMethodNotAllowed(x: RouteMatch | MethodNotAllowed | null): x is MethodNotAllowed {
  return x !== null && "kind" in x && x.kind === "method-not-allowed";
}

function outcomeToResponse(outcome: AuthorizeOutcome, requestId: string): Response | null {
  switch (outcome.status) {
    case "allow":
      return null; // caller continues with the allow result
    case "deny":
      return gatewayError(outcome.code, "Authorization denied", requestId, outcome.httpStatus);
    case "unavailable":
      return gatewayError("AUTH_UNAVAILABLE", "Authorization service unavailable", requestId, 503);
    case "bad-response":
      return gatewayError("BAD_AUTH_RESPONSE", "Authorization contract violation", requestId, 502);
  }
}

/**
 * CRIT-2 fix: CORS headers on ACTUAL responses (not just preflights).
 * Mirrors the preflight decision: exact origin match against the route's
 * declared allowedOrigins, credentials only when declared. Never emits
 * headers on non-CORS routes or unmatched origins.
 */
function applyCorsResponseHeaders(response: Response, rule: RouteRule, origin: string | undefined): void {
  if (rule.cors === undefined || origin === undefined) return;
  if (!rule.cors.allowedOrigins.includes(origin)) return;
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.append("Vary", "Origin");
  if (rule.cors.allowCredentials) {
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }
}

export function createApp() {
  const app = new Hono<GatewayEnv>();

  // 1. Request logger (structured JSON; no credential values, no headers).
  app.use("*", async (c, next) => {
    const start = Date.now();
    await next();
    console.log(
      JSON.stringify({
        level: "info",
        requestId: c.get("requestId"),
        method: c.req.method,
        path: new URL(c.req.url).pathname,
        status: c.res.status,
        durationMs: Date.now() - start,
      }),
    );
  });

  // 2. Request ID generator.
  app.use("*", async (c, next) => {
    const requestId = crypto.randomUUID();
    c.set("requestId", requestId);
    await next();
    c.res.headers.set("Gateway-Request-Id", requestId);
  });

  // Global error handler — never expose stack traces.
  app.onError((err, c) => {
    console.error(
      JSON.stringify({ level: "error", requestId: c.get("requestId"), message: err.message }),
    );
    return gatewayError("INTERNAL_ERROR", "Internal server error", c.get("requestId"), 500);
  });

  // G-01: WebSocket upgrades are rejected before any route is read.
  app.use("*", async (c, next) => {
    if ((c.req.header("Upgrade") ?? "").toLowerCase() === "websocket") {
      return gatewayError(
        "WEBSOCKET_NOT_SUPPORTED",
        "WebSocket upgrades are not supported",
        c.get("requestId"),
        501,
      );
    }
    await next();
  });

  // Health: no topology, no secrets, no rate limiting, no auth.
  app.use("*", async (c, next) => {
    if (new URL(c.req.url).pathname !== HEALTH_PATH) return next();
    return c.json({ status: "ok" }, 200, { "Cache-Control": "no-store" });
  });

  // 3. Header strip — capture client IP first, then strip untrusted headers.
  app.use("*", async (c, next) => {
    c.set("clientIp", c.req.header("CF-Connecting-IP") ?? null);
    c.set("sanitizedHeaders", stripInboundHeaders(c.req.raw.headers));
    await next();
  });

  // 4. CORS preflight — per-route config, answered before any auth work.
  app.use("*", async (c, next) => {
    if (c.req.method !== "OPTIONS") return next();
    const canonical = canonicalizePath(new URL(c.req.url).pathname);
    if (canonical === null) return next();
    const outcome = boot(c.env).registry.routes.match(new URL(c.req.url).host, canonical, c.req.method);
    if (outcome !== null && "rule" in outcome && outcome.rule.cors !== undefined) {
      const origin = c.req.header("Origin");
      if (origin !== undefined && outcome.rule.cors.allowedOrigins.includes(origin)) {
        const methods =
          typeof outcome.rule.method === "string" ? [outcome.rule.method] : outcome.rule.method;
        const headers = new Headers({
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": methods.join(", "),
          "Access-Control-Allow-Headers":
            c.req.header("Access-Control-Request-Headers") ?? "Content-Type, Authorization",
          "Vary": "Origin",
          "Cache-Control": "no-store",
        });
        if (outcome.rule.cors.allowCredentials) {
          headers.set("Access-Control-Allow-Credentials", "true");
        }
        return new Response(null, { status: 204, headers });
      }
    }
    return next();
  });

  // 5. Route matching + dispatch.
  app.use("*", async (c) => {
    const requestId: string = c.get("requestId");
    const clientIp: string | null = c.get("clientIp");
    const sanitized: Headers = c.get("sanitizedHeaders");
    const url = new URL(c.req.url);
    const pathname = url.pathname;
    const requestOrigin = c.req.header("Origin");

    // ── Auth routes: rate-limited passthrough (CRIT-1) ──
    if (pathname === AUTH_PREFIX || pathname.startsWith(`${AUTH_PREFIX}/`)) {
      const authLimit = createRateLimitMiddleware({
        key: `${clientIp ?? "unknown"}:auth`,
        limit: readIntEnv(c.env.RATE_LIMIT_AUTH_LIMIT, DEFAULT_AUTH_RATE_LIMIT.limit),
        windowMs: readIntEnv(c.env.RATE_LIMIT_WINDOW_MS, DEFAULT_AUTH_RATE_LIMIT.windowMs),
      });
      const rateResult = await authLimit(c, async () => undefined);
      if (rateResult instanceof Response) return rateResult;

      const deadline = readIntEnv(c.env.AUTH_DEADLINE_MS, DEFAULT_AUTH_DEADLINE_MS);
      return forwardAuthRequest(c.env.AUTH_WORKER, c.req.raw, sanitized, deadline);
    }

    // ── Canonicalize + match ──
    const canonical = canonicalizePath(pathname);
    if (canonical === null) {
      return gatewayError("MALFORMED_CREDENTIAL", "Invalid request path", requestId, 400);
    }
    const { registry, cookieNames } = boot(c.env);
    const outcome = registry.routes.match(url.host, canonical, c.req.method);
    if (outcome === null) {
      return gatewayError("NOT_FOUND", "Not found", requestId, 404);
    }
    if (isMethodNotAllowed(outcome)) {
      return gatewayError("NOT_FOUND", "Method not allowed", requestId, 405, {
        Allow: outcome.allowedMethods.join(", "),
      });
    }
    const { rule, params } = outcome;

    const origin = registry.config.origins.find((o) => o.id === rule.originId);
    if (origin === undefined) {
      return gatewayError("INTERNAL_ERROR", "Internal server error", requestId, 500);
    }
    const originSecret = readOriginSecret(c.env, origin.secretEnvVar);
    if (originSecret === null) {
      return gatewayError("INTERNAL_ERROR", "Internal server error", requestId, 500);
    }
    let destinationPath: string | null = null;
    if (rule.destinationPath === "@identity") {
      // Local gateway response — no origin involved. Authorization still
      // runs in full below; this branch only skips forwarding.
      // (checked before buildDestinationPath, which rejects non-"/" templates)
    } else {
      destinationPath = buildDestinationPath(rule.destinationPath, params);
      if (destinationPath === null) {
        // Invalid identifiers are rejected with 400 before authorization.
        return gatewayError("MALFORMED_CREDENTIAL", "Invalid path parameters", requestId, 400);
      }
    }

    // ── Rate limit — fail-closed, uniform across route kinds (G-03) ──
    const rateLimited = createRateLimitMiddleware({
      key: `${clientIp ?? "unknown"}:${rule.id}`,
      limit: readIntEnv(c.env.RATE_LIMIT_LIMIT, DEFAULT_RATE_LIMIT.limit),
      windowMs: readIntEnv(c.env.RATE_LIMIT_WINDOW_MS, DEFAULT_RATE_LIMIT.windowMs),
    });
    const rateResult = await rateLimited(c, async () => undefined);
    if (rateResult instanceof Response) return rateResult;

    // ── Policy + authorization ──
    const built = buildPolicy(rule.policy, params);
    if (built.kind === "invalid-organization-context") {
      return gatewayError("FORBIDDEN", "Invalid organization identifier", requestId, 400);
    }

    const deadlineMs = rule.deadlineMs ?? origin.deadlineMs;
    let identityHeaders: Headers;
    let allowResult: AuthorizeAllow | null = null;

    if (built.kind === "public") {
      identityHeaders = new Headers({
        "Gateway-Origin-Auth": originSecret,
        "Gateway-Request-Id": requestId,
      });
    } else {
      const credential = extractCredential(
        new Request(c.req.url, { method: c.req.method, headers: sanitized }),
        cookieNames,
      );
      if (credential.status === "ambiguous") {
        return gatewayError("AMBIGUOUS_CREDENTIAL", "Provide either a session cookie or a bearer token", requestId, 400);
      }
      if (credential.status === "malformed") {
        return gatewayError("MALFORMED_CREDENTIAL", `Malformed credential: ${credential.detail}`, requestId, 400);
      }
      if (credential.status === "none") {
        return gatewayError("NO_CREDENTIAL", "Authentication required", requestId, 401);
      }

      const authDeadline = readIntEnv(c.env.AUTH_DEADLINE_MS, DEFAULT_AUTH_DEADLINE_MS);
      const requestBody: AuthorizeRequestBody = { requestId, audience: c.env.GATEWAY_AUDIENCE, policy: built.policy };
      const authorizeOutcome = await callAuthorize(
        c.env.AUTH_WORKER, credential.credential, requestBody, authDeadline, clientIp,
      );
      const denial = outcomeToResponse(authorizeOutcome, requestId);
      if (denial !== null) return denial;
      if (authorizeOutcome.status !== "allow") {
        return gatewayError("INTERNAL_ERROR", "Internal server error", requestId, 500);
      }
      allowResult = authorizeOutcome.result;
      identityHeaders = new Headers({
        "Gateway-Origin-Auth": originSecret,
        "Gateway-Request-Id": requestId,
        "Gateway-User-Id": authorizeOutcome.result.user.id,
        "Gateway-Session-Id": authorizeOutcome.result.session.id,
        "Gateway-Policy-Id": rule.id,
      });
      if (authorizeOutcome.result.organizationId !== undefined) {
        identityHeaders.set("Gateway-Organization-Id", authorizeOutcome.result.organizationId);
      }
    }

    // ── Local identity route ──
    if (rule.destinationPath === "@identity") {
      if (allowResult  === null) {
        return gatewayError("INTERNAL_ERROR", "Internal server error", requestId, 500);
      }
      return Response.json(
        {
          requestId,
          policyId: rule.id,
          userId: allowResult.user.id,
          sessionId: allowResult.session.id,
          organizationId: allowResult.organizationId ?? null,
        },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (destinationPath === null) {             
      return gatewayError("INTERNAL_ERROR", "Internal server error", requestId, 500);
    }

    // ── Forward ──
    const forwardInit: RequestInit = { method: c.req.method, headers: sanitized };
    if (c.req.raw.body !== null) {
      forwardInit.body = c.req.raw.body;
      // @ts-expect-error duplex is required when streaming a request body
      forwardInit.duplex = "half";
    }
    const proxied = new Request(c.req.url, forwardInit);
    const response = await forwardToOrigin(proxied, origin, destinationPath, identityHeaders, deadlineMs, {
      requestId,
      ...(rule.maxBodyBytes !== undefined ? { maxBodyBytes: rule.maxBodyBytes } : {}),
      ...(rule.allowRedirects !== undefined ? { allowRedirects: rule.allowRedirects } : {}),
    });

    applyCorsResponseHeaders(response, rule, requestOrigin);
    return response;
  
  });

  app.notFound((c) => gatewayError("NOT_FOUND", "Not found", c.get("requestId") ?? "unknown", 404));

  return app;
}

export default createApp();
