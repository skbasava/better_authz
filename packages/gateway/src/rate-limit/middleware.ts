import type { Context, Next } from "hono";

import { gatewayError } from "../errors/responses.js";
import type { GatewayEnv } from "../types/env.js";

export interface RateLimitOptions {
  /** Stable identity for the bucket, e.g. `${clientIp}:${routeId}`. */
  readonly key: string;
  readonly limit: number;
  readonly windowMs: number;
}

/**
 * Fail-closed (G-03): any Durable Object failure or non-200 response yields
 * 503 RATE_LIMITED. Never silently allows.
 */
export function createRateLimitMiddleware(options: RateLimitOptions) {
  return async (c: Context<GatewayEnv>, next: Next): Promise<Response | void> => {
    let outcome: { allowed: boolean; retryAfterMs: number } | null = null;
    try {
      const stub = c.env.RATE_LIMITER.get(c.env.RATE_LIMITER.idFromName(options.key));
      const res = await stub.fetch("https://rate-limit.internal/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: options.limit, windowMs: options.windowMs }),
      });
      if (res.status !== 200) {
        return gatewayError("RATE_LIMITED", "Rate limiter unavailable", c.get("requestId"), 503);
      }
      const json: unknown = await res.json();
      if (
        typeof json === "object" &&
        json !== null &&
        typeof (json as { allowed?: unknown }).allowed === "boolean" &&
        typeof (json as { retryAfterMs?: unknown }).retryAfterMs === "number"
      ) {
        outcome = json as { allowed: boolean; retryAfterMs: number };
      }
    } catch {
      outcome = null;
    }

    if (outcome === null) {
      return gatewayError("RATE_LIMITED", "Rate limiter unavailable", c.get("requestId"), 503);
    }
    if (!outcome.allowed) {
      return gatewayError("RATE_LIMITED", "Too many requests", c.get("requestId"), 503, {
        "Retry-After": String(Math.ceil(outcome.retryAfterMs / 1000)),
      });
    }
    await next();
  };
}
