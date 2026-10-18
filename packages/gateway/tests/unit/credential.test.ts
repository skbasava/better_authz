import { describe, expect, it } from "vitest";

import { extractCredential } from "../../src/credential/adapter.js";

const COOKIES = ["session", "other_session"];

function req(headers: Record<string, string>): Request {
  return new Request("https://gateway.example/api/x", { headers });
}

describe("extractCredential", () => {
  it("extracts a recognized session cookie", () => {
    const r = extractCredential(req({ Cookie: "session=abc123; theme=dark" }), COOKIES);
    expect(r).toEqual({ status: "ok", credential: { kind: "cookie", name: "session", value: "abc123" } });
  });

  it("extracts a bearer token", () => {
    const r = extractCredential(req({ Authorization: "Bearer tok_123" }), COOKIES);
    expect(r).toEqual({ status: "ok", credential: { kind: "bearer", value: "tok_123" } });
  });

  it("is case-insensitive on the bearer scheme", () => {
    const r = extractCredential(req({ Authorization: "bearer tok_123" }), COOKIES);
    expect(r.status).toBe("ok");
  });

  it("ambiguous when both cookie and bearer are valid", () => {
    const r = extractCredential(
      req({ Cookie: "session=abc", Authorization: "Bearer tok" }),
      COOKIES,
    );
    expect(r).toEqual({ status: "ambiguous" });
  });

  it("detects duplicate recognized cookies", () => {
    const r = extractCredential(req({ Cookie: "session=a; session=b" }), COOKIES);
    expect(r).toEqual({ status: "malformed", detail: "duplicate-session-cookie" });
  });

  it("rejects empty session value", () => {
    const r = extractCredential(req({ Cookie: "session=" }), COOKIES);
    expect(r).toEqual({ status: "malformed", detail: "empty-session-value" });
  });

  it("rejects invalid bearer syntax", () => {
    expect(extractCredential(req({ Authorization: "Bearer" }), COOKIES)).toEqual({
      status: "malformed",
      detail: "invalid-bearer-syntax",
    });
    expect(extractCredential(req({ Authorization: "Bearer a b" }), COOKIES)).toEqual({
      status: "malformed",
      detail: "invalid-bearer-syntax",
    });
    expect(extractCredential(req({ Authorization: "Basic abc" }), COOKIES)).toEqual({
      status: "malformed",
      detail: "invalid-bearer-syntax",
    });
  });

  it("unmatched cookies do not create ambiguity", () => {
    const r = extractCredential(
      req({ Cookie: "unrelated=xyz", Authorization: "Bearer tok" }),
      COOKIES,
    );
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.credential.kind).toBe("bearer");
  });

  it("returns none when no credential is present", () => {
    expect(extractCredential(req({}), COOKIES)).toEqual({ status: "none" });
  });

  it("matches exact cookie names, not substrings", () => {
    const r = extractCredential(req({ Cookie: "session_extra=abc" }), COOKIES);
    expect(r).toEqual({ status: "none" });
  });
});
