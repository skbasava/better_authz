import { describe, it } from "vitest";

// Runs against the real gateway Worker in the Workers test pool with a
// stubbed AUTH_WORKER binding (session/permission behavior itself is covered
// by the auth integration suite — no Better Auth mocking happens here).

describe("header isolation (§10.11, §10.5)", () => {
  it.todo("spoofed Gateway-* identity headers are stripped before authorize");

  it.todo("a request denied by the authorize endpoint never reaches the origin");

  it.todo("direct origin call without Gateway-Origin-Auth is rejected by the backend");
});
