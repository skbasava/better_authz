/**
 * Policy chain SDK (adapted patterns; security floor preserved).
 *
 * Zuplo-style: per-route ordered policy chains with short-circuit semantics
 * (a policy returning a Response terminates the chain).
 * Divergence (deliberate, spec'd): the MANDATORY CORE — canonicalize,
 * strip, rate-limit, credential, authorize — is assembled by the runtime
 * and can never be reordered or omitted via config. `policyChain` only
 * ADDS optional policies around the floor.
 */
import type { RequestValidationConfig } from "@gateway/shared";

export interface PolicyContext {
  readonly requestId: string;
  readonly clientIp: string | null;
  readonly userId: string | null;
  readonly organizationId: string | null;
  readonly routeId: string;
}

export type InboundPolicy = (
  request: Request,
  context: PolicyContext,
) => Promise<Request | Response>;

export interface PolicyRegistry {
  readonly get: (name: string) => InboundPolicy | undefined;
}

/** Input handed to dynamic rate-limit resolvers (per-tier / per-tenant). */
export interface RateLimitContext extends PolicyContext {
  readonly audience: string;
}

export interface RateLimitDecision {
  readonly key: string;
  readonly limit?: number;
  readonly windowMs?: number;
}

export interface RouteValidationOptions {
  readonly mode: RequestValidationConfig["mode"];
  readonly schema: RequestValidationConfig["schema"];
  readonly maxBodyBytes?: number;
}
