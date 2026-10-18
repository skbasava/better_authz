import { describe, expect, it } from "vitest";

// Unit tests for the fixed-window algorithm against an in-memory
// BucketStore. Runtime integration with the DO namespace is covered in
// tests/integration/rate-limit.test.ts.

import { RateLimiterDO, type LimiterState } from "../../src/rate-limit/limiter-do.js";

function makeState(initial: unknown = null): LimiterState {
  const store = new Map<string, unknown>(initial === null ? [] : [["bucket", initial]]);
  return {
    storage: {
      get: async (k: string) => store.get(k) ?? null,
      put: async (k: string, v: unknown) => void store.set(k, v),
    },
    blockConcurrencyWhile: (fn: () => Promise<void>) => fn(),
  };
}

function check(limit: number, windowMs: number): Request {
  return new Request("https://x/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ limit, windowMs }),
  });
}

describe("RateLimiterDO fixed window", () => {
  it("allows up to limit then denies within the window", async () => {
    const limiter = new RateLimiterDO(makeState(), {});
    for (let i = 0; i < 3; i += 1) {
      const r = await limiter.fetch(check(3, 60_000));
      expect(await r.json()).toEqual({ allowed: true, retryAfterMs: 0 });
    }
    const denied = await limiter.fetch(check(3, 60_000));
    const body = (await denied.json()) as { allowed: boolean; retryAfterMs: number };
    expect(body.allowed).toBe(false);
    expect(body.retryAfterMs).toBeGreaterThan(0);
    expect(body.retryAfterMs).toBeLessThanOrEqual(60_000);
  });

  it("resets after the window elapses", async () => {
    const limiter = new RateLimiterDO(makeState({ tokens: 0, windowStart: Date.now() - 61_000 }), {});
    const r = await limiter.fetch(check(2, 60_000));
    expect(await r.json()).toMatchObject({ allowed: true });
  });

  it("returns 400 on invalid bodies", async () => {
    const limiter = new RateLimiterDO(makeState(), {});
    const r = await limiter.fetch(
      new Request("https://x/check", {
        method: "POST",
        body: JSON.stringify({ limit: -1, windowMs: 0 }),
      }),
    );
    expect(r.status).toBe(400);
  });
});
