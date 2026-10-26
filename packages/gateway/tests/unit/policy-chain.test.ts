import { describe, expect, it } from "vitest";

import { runPolicyChain } from "../../src/policies/chain.js";
import type { PolicyRegistry } from "../../src/policies/types.js";
import { msUntilMonthEnd } from "../../src/rate-limit/middleware.js";

const ctx = { requestId: "r1", clientIp: "1.2.3.4", userId: null, organizationId: null, routeId: "t" };

describe("runPolicyChain", () => {
  it("passes the request through all policies when none responds", async () => {
    const registry: PolicyRegistry = {
      get: () => async (req) => req,
    };
    const out = await runPolicyChain(["a", "b"], registry, new Request("https://x/"), ctx);
    expect(out.kind).toBe("continue");
  });

  it("short-circuits on the first Response", async () => {
    let ranSecond = false;
    const registry: PolicyRegistry = {
      get: (name) =>
        name === "deny"
          ? async () => new Response("no", { status: 403 })
          : async () => {
              ranSecond = true;
              return new Request("https://x/");
            },
    };
    const out = await runPolicyChain(["deny", "later"], registry, new Request("https://x/"), ctx);
    expect(out.kind).toBe("responded");
    if (out.kind === "responded") expect(out.response.status).toBe(403);
    expect(ranSecond).toBe(false);
  });

  it("unknown policy name fails closed with a 500", async () => {
    const registry: PolicyRegistry = { get: () => undefined };
    const out = await runPolicyChain(["ghost"], registry, new Request("https://x/"), ctx);
    expect(out.kind).toBe("responded");
    if (out.kind === "responded") {
      expect(out.response.status).toBe(500);
      expect(await out.response.text()).toMatch(/Unknown policy/);
    }
  });

  it("a policy can rebuild the request for the next policy", async () => {
    const registry: PolicyRegistry = {
      get: () => async (req) =>
        new Request(req.url, { method: req.method, headers: new Headers({ "X-Stamped": "1" }) }),
    };
    const out = await runPolicyChain(["stamp"], registry, new Request("https://x/"), ctx);
    expect(out.kind).toBe("continue");
  });
});

describe("msUntilMonthEnd (quota anchor)", () => {
  it("returns a positive window ending at the next month", () => {
    const now = new Date("2026-10-15T12:00:00Z");
    const ms = msUntilMonthEnd(now);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThan(32 * 24 * 60 * 60 * 1000);
  });
});
