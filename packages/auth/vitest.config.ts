import { defineConfig } from "vitest/config";

// COMPATIBILITY GATE (runner check, Task 0 Step 4):
// @cloudflare/vitest-pool-workers@0.23.0 peers vitest ^4.1.0 but fails
// under vitest 4 ("Runner not supported"); no vitest-3-compatible pool
// release confirmed. Unit tests are pure functions and run on the default
// Node pool. Integration tests requiring Workers runtime bindings stay
// gated until a verified pool pairing exists
// (docs/compatibility/initial-findings.md).
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
