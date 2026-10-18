import { Hono } from "hono";

import type { AuthEnv } from "../types/env.js";

// COMPATIBILITY GATES [B-01/B-02/B-03/B-05]:
// This placeholder map must be replaced by the verified endpoint inventory
// from docs/compatibility/auth-endpoints.md (Task 0). Each entry requires an
// authoritative-organization resolution decision for org/member/invitation
// ID-bearing bodies (Review Focus 2) before inclusion.
const ALLOWED_AUTH_ENDPOINTS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["/api/auth/sign-in/email", new Set(["POST"])],
  ["/api/auth/sign-up/email", new Set(["POST"])],
  ["/api/auth/sign-out", new Set(["POST"])],
  ["/api/auth/get-session", new Set(["GET"])],
  ["/api/auth/request-password-reset", new Set(["POST"])],
  ["/api/auth/reset-password", new Set(["POST"])],
]);

export function createPublicRoutes(getAuthInstance: (env: AuthEnv["Bindings"]) => { handler: (r: Request) => Promise<Response> | Response }): Hono<AuthEnv> {
  const routes = new Hono<AuthEnv>();

  routes.all("*", async (c) => {
    const pathname = new URL(c.req.url).pathname;
    const methods = ALLOWED_AUTH_ENDPOINTS.get(pathname);
    // Exact path + method allowlist; anything else is denied (404).
    if (methods === undefined || !methods.has(c.req.method)) {
      return c.json({ code: "NOT_FOUND", message: "Not found" }, 404);
    }
    const auth = getAuthInstance(c.env);
    return auth.handler(c.req.raw);
  });

  return routes;
}
