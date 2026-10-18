import { Hono } from "hono";

import { authorizeHandler } from "../authorize/handler.js";
import { createBetterAuthOrgReader } from "../authorize/policy.js";
import type { AuthEnv } from "../types/env.js";

export function createInternalRoutes(): Hono<AuthEnv> {
  const routes = new Hono<AuthEnv>();

  // Only POST /_internal/v1/authorize exists. All other /_internal paths: 404.
  routes.post("/v1/authorize", (c) => authorizeHandler(c.req.raw, c.env, createBetterAuthOrgReader));

  routes.all("*", (c) => c.json({ code: "NOT_FOUND", message: "Not found" }, 404));

  return routes;
}
