import { Hono } from "hono";

import { getAuth } from "./better-auth/instance.js";
import { createInternalRoutes } from "./routes/internal.js";
import { createPublicRoutes } from "./routes/public.js";
import type { AuthEnv } from "./types/env.js";

const app = new Hono<AuthEnv>();

app.use("*", async (c, next) => {
  await next();
  c.res.headers.set("Cache-Control", "no-store");
});

// Public auth surface: exact-allowlisted Better Auth endpoints only.
app.route("/api/auth", createPublicRoutes((env) => getAuth(env)));
// Binding-only internal authorization endpoint.
app.route("/_internal", createInternalRoutes());

app.notFound((c) => c.json({ code: "NOT_FOUND", message: "Not found" }, 404));

app.onError((err, c) => {
  // Never leak internals; no stack traces.
  console.error(JSON.stringify({ level: "error", message: err.message }));
  return c.json({ code: "INTERNAL_ERROR", message: "Internal server error" }, 500);
});

export default app;
