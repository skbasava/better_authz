// COMPATIBILITY GATE [B-01]: RESOLVED — 1.7.10 exports no kysely adapter
// (verified via exports map: only prisma/drizzle/mongodb/memory). D1 is
// reached via drizzle-orm's first-party D1 driver + the drizzle adapter.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import { organization } from "better-auth/plugins";

// Migration generation never queries the database; the adapter only needs
// to exist. A stub satisfies the type without touching D1.
const stubDb = {} as D1Database;

export const auth = betterAuth({
  baseURL: "https://auth-gateway.satish-aradhya.workers.dev",
  secret: "migration-generation-only",
  database: drizzleAdapter(drizzle(stubDb), { provider: "sqlite" }),
  plugins: [
    organization()
  ],
});
