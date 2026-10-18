import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
// import { admin } from "better-auth/plugins/admin";            // GATE [B-02]
// import { organization } from "better-auth/plugins/organization"; // GATE [B-03]
// import { bearer } from "better-auth/plugins/bearer";           // GATE [B-05]

import type { AuthBindings } from "../types/env.js";

// COMPATIBILITY GATES [B-01/B-02/B-03/B-05]:
// - The exact plugin wiring below must be verified against pinned better-auth
//   1.7.10 (plugin export names, D1/drizzle adapter options, secret env).
// - Do not enable a plugin line until its gate is recorded as passed in
//   docs/compatibility/gate-status.md.

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

  // COMPATIBILITY GATE [B-01]: verify adapter construction against the
  // pinned release before enabling. Until then, instance creation fails
  // closed rather than running an unverified configuration.
  throw new Error(
    "COMPATIBILITY GATE [B-01]: better-auth instance wiring not enabled — verify " +
      "adapter + plugin exports against pinned 1.7.10 (docs/compatibility/gate-status.md)",
  );

  // Intended shape once gates pass (DO NOT enable without recorded evidence):
  //
  // const auth = betterAuth({
  //   baseURL: env.BETTER_AUTH_URL,
  //   secret: env.BETTER_AUTH_SECRET,
  //   database: drizzleAdapter(/* D1 binding */, { provider: "sqlite" }),
  //   plugins: [/* admin() GATE B-02, organization() GATE B-03, bearer() GATE B-05 */],
  // });
  // The verified betterAuth() return type satisfies AuthInstance structurally;
  // no cast is needed once the wiring is enabled against the pinned types.
  // const instance: AuthInstance = auth;
  // cache.set(env, instance);
  // return instance;
}
