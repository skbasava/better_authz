import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import { bearer } from "better-auth/plugins/bearer";

import type { AuthBindings } from "../types/env.js";
import * as schema from "../../drizzle/schema.js";

// COMPATIBILITY GATE [B-01]: PASSED — adapter verified against installed
// 1.7.10 exports (drizzle adapter + drizzle-orm/d1 driver; no kysely export
// exists in this version). Evidence in docs/compatibility/gate-status.md.
//
// COMPATIBILITY GATE [B-03]: organization() plugin goes here ONLY after the
// org-plugin API is verified. Org tables already exist in D1.

interface AuthInstance {
  handler: (request: Request) => Response | Promise<Response>;
  api: {
    getSession: (args: { headers: Headers }) => Promise<unknown>;
  };
}

const cache = new WeakMap<AuthBindings, AuthInstance>();

export function getAuth(env: AuthBindings): AuthInstance {
  const existing = cache.get(env);
  if (existing !== undefined) return existing;

  // P0-5 (review): wire ALLOWED_ORIGINS to better-auth's trusted origins.
  // An empty var means "derive from baseURL only" (better-auth default).
  const trustedOrigins = env.ALLOWED_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");

  const config = {
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(drizzle(env.DB), { provider: "sqlite", schema }),
    plugins: [bearer()],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      // P1 (review): enable once email delivery is configured — until then
      // verified-email enforcement would lock out every new user.
      // requireEmailVerification: true,
    },
    // P1 (review): explicit session lifetime policy (was better-auth default).
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days, seconds
      updateAge: 60 * 60 * 24, // refresh cookie daily, seconds
    },
    // P1 (review): pin secure cookies explicitly (observed as __Secure-
    // prefixed in live responses; make it configured, not incidental).
    advanced: {
      useSecureCookies: true,
    },
  };

  // COMPATIBILITY NOTE [B-01 follow-up]: better-auth ships built-in per-IP
  // rate limiting for auth endpoints. Verify the 1.7.10 defaults (window/max
  // units) via probe, then pin explicitly, e.g.:
  //   rateLimit: { window: 60, max: 50 },
  // Until verified, gateway-level auth rate limiting (CRIT-1) is the
  // enforced control.

  const auth =
    trustedOrigins.length > 0
      ? betterAuth({ ...config, trustedOrigins: [...trustedOrigins, env.BETTER_AUTH_URL] })
      : betterAuth(config);

  const instance: AuthInstance = auth;
  cache.set(env, instance);
  return instance;
}
