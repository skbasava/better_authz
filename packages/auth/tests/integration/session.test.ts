import { describe, expect, it } from "vitest";

// INTEGRATION (GATED): These tests exercise the REAL pinned Better Auth
// instance in an isolated non-production D1 database. They must not be
// skipped silently: they fail (not skip) until COMPATIBILITY GATES
// [B-01/B-06] are recorded as passed in docs/compatibility/gate-status.md.

describe("session integration", () => {
  it("sign-in establishes a session resolvable by the authorize endpoint", () => {
    // COMPATIBILITY GATE [B-01/B-06]: implement against the verified
    // sign-in endpoint and getSession contract after Task 0 evidence.
    throw new Error("COMPATIBILITY GATE [B-01/B-06]: integration test blocked — see gate-status.md");
  });

  it("sign-out invalidates the session (§10.1)", () => {
    throw new Error("COMPATIBILITY GATE [B-01]: blocked until sign-in/out endpoints verified");
  });
});
