import { describe, it } from "vitest";

// Gateway-side auth-flow integration. Session behavior itself is verified by
// the auth integration suite against real Better Auth (no mocking); these
// tests verify the gateway's orchestration of the flow end to end.

describe("auth flow integration", () => {
  it.todo("browser sign-in through the gateway creates a session cookie (§10.1)");

  it.todo("sign-out invalidates the session for subsequent requests (§10.1)");

  it.todo("bearer token issued at sign-in authorizes a mobile request (§10.2)");

  it.todo("malformed cookie, tampered token, and expired session are rejected (§10.3)");

  it.todo("renewal Set-Cookie headers preserved on allow and deny (§10.4, §10.24)");

  it.todo("authorization timeout returns 503 and is never retried (§10.21)");

  it.todo("malformed/duplicate credentials produce zero auth Worker calls (§10.22)");
});
