import { describe, it } from "vitest";

describe("rate limiter fail-closed (G-03, §10.26)", () => {
  it.todo("Durable Object throw -> 503 RATE_LIMITED on an authenticated route");

  it.todo("Durable Object throw -> 503 RATE_LIMITED on a public route (uniform)");

  it.todo("exhausted bucket -> 503 with Retry-After");
});
