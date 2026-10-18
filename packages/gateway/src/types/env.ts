
export interface GatewayBindings {
  /** Service binding to the auth Worker. */
  AUTH_WORKER: Fetcher;
  RATE_LIMITER: DurableObjectNamespace;
  /** JSON-serialized GatewayConfig (Worker env var). */
  GATEWAY_CONFIG: string;
  /** JSON-serialized PermissionCatalog (Worker env var). */
  PERMISSION_CATALOG: string;
  /** Comma-separated recognized session cookie names. */
  SESSION_COOKIE_NAMES: string;
  /** Authentication authorize deadline, ms. */
  AUTH_DEADLINE_MS: string;
  /** Fixed-window rate limiter settings (optional). */
  RATE_LIMIT_LIMIT?: string;
  RATE_LIMIT_WINDOW_MS?: string;

  // Per-origin secrets, e.g. ORIGIN_BILLING_SECRET, named by
  // OriginConfig.secretEnvVar; accessed via env[config.secretEnvVar].
  [key: string]: unknown;
}

export interface GatewayVariables {
  requestId: string;
  clientIp: string | null;
  sanitizedHeaders: Headers;
}

export type GatewayEnv = {
  Bindings: GatewayBindings;
  Variables: GatewayVariables;
};
