import type { Context, Next } from "hono";

import { gatewayError } from "../errors/responses.js";
import type { GatewayEnv } from "../types/env.js";
import type { RateLimitContext, RateLimitDecision } from "../policies/types.js";

export interface RateLimitOptions {
  /** Stable identity for the bucket, e.g. `${clientIp}:${routeId}`. */
  readonly key: string;
  readonly limit: number;
  readonly windowMs: number;
}

/**
 * Dynamic resolver (Phase 2, Zuplo rateLimitBy pattern): decide the bucket
 * key AND the limit per request — tier/tenant limits become config, not
 * deployments. MUST be deterministic and fast; runs on every request.
 * Fail-closed is NOT configurable (G-03): unlike the inspiration, there is
 * no fail-open/async knob here by design.
 */
export interface DynamicRateLimitOptions {
  readonly resolve: (context: RateLimitContext) => RateLimitDecision;
  readonly defaultLimit: number;
  readonly defaultWindowMs: number;
}

function failClosed(c: Context<GatewayEnv>): Response {
  return gatewayError("RATE_LIMITED", "Rate limiter unavailable", c.get("requestId"), 503);
}

async function checkBucket(
  c: Context<GatewayEnv>,
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ allowed: boolean; retryAfterMs: number } | null> {
  try {
    const stub = c.env.RATE_LIMITER.get(c.env.RATE_LIMITER.idFromName(key));
    const res = await stub.fetch("https://rate-limit.internal/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit, windowMs }),
    });
    if (res.status !== 200) return null;
    const json: unknown = await res.json();
    if (
      typeof json === "object" && json !== null &&
      typeof (json as { allowed?: unknown }).allowed === "boolean" &&
      typeof (json as { retryAfterMs?: unknown }).retryAfterMs === "number"
    ) {
      return json as { allowed: boolean; retryAfterMs: number };
    }
    return null;
  } catch {
    return null;
  }
}

/** Fixed-window limiter (static options). */
export function createRateLimitMiddleware(options: RateLimitOptions) {
  return async (c: Context<GatewayEnv>, next: Next): Promise<Response | void> => {
    const outcome = await checkBucket(c, options.key, options.limit, options.windowMs);
    if (outcome === null) return failClosed(c);
    if (!outcome.allowed) {
      return gatewayError("RATE_LIMITED", "Too many requests", c.get("requestId"), 503, {
        "Retry-After": String(Math.ceil(outcome.retryAfterMs / 1000)),
      });
    }
    await next();
  };
}

/** Dynamic limiter: per-request key and limit (tiers, tenants, quotas). */
export function createDynamicRateLimitMiddleware(options: DynamicRateLimitOptions) {
  return async (c: Context<GatewayEnv>, next: Next): Promise<Response | void> => {
    const decision = options.resolve({
      requestId: c.get("requestId"),
      clientIp: c.get("clientIp"),
      userId: c.get("userId") ?? null,
      organizationId: c.get("organizationId") ?? null,
      routeId: c.get("routeId") ?? "",
      audience: c.get("audience") ?? "default",
    });
    const limit = decision.limit ?? options.defaultLimit;
    const windowMs = decision.windowMs ?? options.defaultWindowMs;
    const outcome = await checkBucket(c, decision.key, limit, windowMs);
    if (outcome === null) return failClosed(c);
    if (!outcome.allowed) {
      return gatewayError("RATE_LIMITED", "Too many requests", c.get("requestId"), 503, {
        "Retry-After": String(Math.ceil(outcome.retryAfterMs / 1000)),
      });
    }
    await next();
  };
}

/** Helper: window length until the end of the current calendar month (quota anchors). */
export function msUntilMonthEnd(now: Date = new Date()): number {
  return new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime() - now.getTime();
}
