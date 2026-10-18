import { describe, expect, it } from "vitest";

import { canonicalizePath } from "../../src/routing/canonicalize.js";

describe("canonicalizePath", () => {
  it("accepts ordinary paths", () => {
    expect(canonicalizePath("/api/orgs/acme/invoices")).toEqual({
      segments: ["api", "orgs", "acme", "invoices"],
      hasTrailingSlash: false,
    });
  });

  it("accepts the root path", () => {
    expect(canonicalizePath("/")).toEqual({ segments: [], hasTrailingSlash: false });
  });

  it("decodes segments exactly once", () => {
    expect(canonicalizePath("/a%20b/c")).toEqual({
      segments: ["a b", "c"],
      hasTrailingSlash: false,
    });
  });

  it.each(["/a%2Fb", "/a%2fb", "/a%5Cb", "/a%5cb"])("rejects encoded separators: %s", (p) => {
    expect(canonicalizePath(p)).toBeNull();
  });

  it.each(["/a%00b", "/a%1fb", "/a%7fb"])("rejects control bytes: %s", (p) => {
    expect(canonicalizePath(p)).toBeNull();
  });

  it("rejects invalid percent escapes", () => {
    expect(canonicalizePath("/a%2")).toBeNull();
    expect(canonicalizePath("/a%zz")).toBeNull();
    expect(canonicalizePath("/a%")).toBeNull();
  });

  it("rejects double encoding (remaining % after decode)", () => {
    expect(canonicalizePath("/a%252Fb")).toBeNull();
  });

  it("rejects repeated slashes", () => {
    expect(canonicalizePath("/a//b")).toBeNull();
  });

  it("rejects non-ASCII after decode", () => {
    expect(canonicalizePath("/%C3%A9")).toBeNull();
  });

  it("records trailing slash significance", () => {
    expect(canonicalizePath("/a/")).toEqual({ segments: ["a"], hasTrailingSlash: true });
    expect(canonicalizePath("/a")).toEqual({ segments: ["a"], hasTrailingSlash: false });
  });

  it("rejects missing leading slash", () => {
    expect(canonicalizePath("a/b")).toBeNull();
    expect(canonicalizePath("")).toBeNull();
  });
});
