import { betterAuth } from "better-auth";
import { drizzle } from "drizzle-orm/d1";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
// import { admin } from "better-auth/plugins/admin";            // GATE [B-02]
import { organization } from "better-auth/plugins/organization"; // GATE [B-03]
import { bearer } from "better-auth/plugins/bearer";           // GATE [B-05]

import * as schema from "../../drizzle/schema.js";

import type { AuthBindings } from "../types/env.js";

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

  const auth = betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(drizzle(env.DB), { provider: "sqlite", schema }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    plugins: [bearer()],
    // COMPATIBILITY GATE [B-03]: organization() goes here ONLY after the
    // org-plugin API is verified. Org tables already exist in D1.
  });

  const instance: AuthInstance = auth;
  cache.set(env, instance);
  return instance;
}
