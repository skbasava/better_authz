export interface AuthBindings {
  /** Authoritative Better Auth database. Auth Worker only. */
  DB: D1Database;
  BETTER_AUTH_URL: string;
  ALLOWED_ORIGINS: string;
  ENVIRONMENT: string;
  /** JSON-serialized PermissionCatalog. */
  PERMISSION_CATALOG: string;
  // BETTER_AUTH_SECRET is a Worker secret (wrangler secret put), never a var.
}

export interface AuthVariables {
  requestId: string;
}

export type AuthEnv = {
  Bindings: AuthBindings;
  Variables: AuthVariables;
};
