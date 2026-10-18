import { Hono } from "hono";

// Minimal example business backend for the gateway.
// Demonstrates: gateway-origin authentication (constant time), trusting
// gateway identity headers only AFTER origin auth, and per-organization
// resource ownership enforcement.

interface Invoice {
  readonly id: string;
  readonly organizationId: string;
  readonly amount: number;
}

// Mock in-memory store.
const INVOICES: readonly Invoice[] = [
  { id: "inv_1", organizationId: "org_acme", amount: 100 },
  { id: "inv_2", organizationId: "org_acme", amount: 250 },
  { id: "inv_3", organizationId: "org_globex", amount: 75 },
];

const ORIGIN_SECRET = process.env.ORIGIN_SECRET ?? "";

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  // Constant-time comparison via digests (Web Crypto).
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  if (va.length !== vb.length) return false;
  let diff = 0;
  for (let i = 0; i < va.length; i += 1) diff |= (va[i] ?? 0) ^ (vb[i] ?? 0);
  return diff === 0;
}

const app = new Hono();

// Health: no gateway or auth checks.
app.get("/health", (c) => c.json({ status: "ok" }));

// Everything below requires gateway-origin authentication.
app.use("*", async (c, next) => {
  const presented = c.req.header("Gateway-Origin-Auth");
  if (presented === undefined || ORIGIN_SECRET === "") {
    return c.json({ error: "missing origin credential" }, 401);
  }
  if (!(await timingSafeEqual(presented, ORIGIN_SECRET))) {
    return c.json({ error: "invalid origin credential" }, 403);
  }
  await next();
});

// Trust gateway identity headers only after origin auth (middleware above).
app.get("/v1/orgs/:orgId/invoices", (c) => {
  const orgId = c.req.param("orgId");
  const headerOrg = c.req.header("Gateway-Organization-Id");
  const userId = c.req.header("Gateway-User-Id");

  // Ownership: reject any record outside the routed organization, even if a
  // spoofed or mismatched header claims otherwise.
  if (headerOrg !== undefined && headerOrg !== orgId) {
    return c.json({ error: "organization header mismatch" }, 403);
  }
  const visible = INVOICES.filter((i) => i.organizationId === orgId);
  return c.json({ organizationId: orgId, requestedBy: userId ?? null, invoices: visible });
});

export default app;
