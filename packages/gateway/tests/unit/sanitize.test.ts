import { describe, expect, it } from "vitest";

import { stripInboundHeaders } from "../../src/proxy/sanitize.js";

describe("stripInboundHeaders", () => {
  it("removes all STRIPPED_INBOUND_HEADERS", () => {
    const headers = new Headers({
      "X-User-Id": "spoofed",
      "X-Session-Id": "spoofed",
      "X-Organization-Id": "spoofed",
      "X-Policy-Id": "spoofed",
      "X-Gateway-Origin-Auth": "spoofed",
      "X-Gateway-Client-IP": "1.2.3.4",
      "X-Request-Id": "spoofed",
      "Forwarded": "for=spoofed",
      "X-Real-IP": "spoofed",
      "Gateway-User-Id": "spoofed",
      "Gateway-Session-Id": "spoofed",
      "Gateway-Organization-Id": "spoofed",
      "Gateway-Request-Id": "spoofed",
      "Gateway-Policy-Id": "spoofed",
      "Gateway-Origin-Auth": "spoofed",
    });
    const out = stripInboundHeaders(headers);
    for (const name of headers.keys()) {
      expect(out.has(name)).toBe(false);
    }
  });

  it("removes X-Forwarded-* by case-insensitive prefix", () => {
    const headers = new Headers({
      "X-Forwarded-For": "1.2.3.4",
      "x-forwarded-proto": "https",
      "X-FORWARDED-HOST": "evil.example",
    });
    const out = stripInboundHeaders(headers);
    expect(out.has("X-Forwarded-For")).toBe(false);
    expect(out.has("X-Forwarded-Proto")).toBe(false);
    expect(out.has("X-Forwarded-Host")).toBe(false);
  });

  it("removes CF-Connecting-IP", () => {
    const out = stripInboundHeaders(new Headers({ "CF-Connecting-IP": "1.2.3.4" }));
    expect(out.has("CF-Connecting-IP")).toBe(false);
  });

  it("preserves unrelated headers", () => {
    const headers = new Headers({ "Content-Type": "application/json", "Accept": "*/*" });
    const out = stripInboundHeaders(headers);
    expect(out.get("Content-Type")).toBe("application/json");
    expect(out.get("Accept")).toBe("*/*");
  });

  it("does not mutate the input", () => {
    const headers = new Headers({ "X-User-Id": "spoofed", "Content-Type": "text/plain" });
    stripInboundHeaders(headers);
    expect(headers.get("X-User-Id")).toBe("spoofed");
  });
});
