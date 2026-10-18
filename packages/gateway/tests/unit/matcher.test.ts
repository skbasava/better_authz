import { describe, expect, it } from "vitest";
import type { RouteRule } from "@gateway/shared";

import { canonicalizePath } from "../../src/routing/canonicalize.js";
import { RouteRegistry, type MethodNotAllowed } from "../../src/routing/matcher.js";

const rule = (overrides: Partial<RouteRule> = {}): RouteRule => ({
  id: "r1",
  method: "GET",
  path: "/api/orgs/:organizationId/invoices",
  originId: "billing",
  destinationPath: "/v1/orgs/:organizationId/invoices",
  policy: { kind: "organization-permission", organizationIdFrom: "path.organizationId", allOf: ["invoice.read"] },
  ...overrides,
});

function match(registry: RouteRegistry, path: string, method = "GET", host = "gw.example") {
  const canonical = canonicalizePath(path);
  expect(canonical).not.toBeNull();
  return registry.match(host, canonical as NonNullable<typeof canonical>, method);
}

describe("RouteRegistry", () => {
  it("matches path and extracts params", () => {
    const r = match(new RouteRegistry([rule()]), "/api/orgs/acme/invoices");
    expect(r).not.toBeNull();
    if (r && "params" in r) {
      expect(r.params.get("organizationId")).toBe("acme");
    }
  });

  it("returns MethodNotAllowed for known path, wrong method", () => {
    const r = match(new RouteRegistry([rule()]), "/api/orgs/acme/invoices", "POST");
    expect(r).toMatchObject({ kind: "method-not-allowed", allowedMethods: ["GET"] });
  });

  it("is case-sensitive", () => {
    expect(match(new RouteRegistry([rule()]), "/API/orgs/acme/invoices")).toBeNull();
  });

  it("treats trailing slash as significant", () => {
    const reg = new RouteRegistry([rule()]);
    expect(match(reg, "/api/orgs/acme/invoices/")).toBeNull();

    const regSlash = new RouteRegistry([rule({ path: "/api/orgs/:organizationId/invoices/" })]);
    expect(match(regSlash, "/api/orgs/acme/invoices/")).not.toBeNull();
    expect(match(regSlash, "/api/orgs/acme/invoices")).toBeNull();
  });

  it("matches multi-method rules and reports Allow", () => {
    const reg = new RouteRegistry([rule({ method: ["GET", "POST"] })]);
    const post = match(reg, "/api/orgs/acme/invoices", "POST");
    expect(post).not.toBeNull();
    expect(post && "rule" in post ? post.rule.method : null).toEqual(["GET", "POST"]);
    const r = match(reg, "/api/orgs/acme/invoices", "DELETE") as MethodNotAllowed;
    expect(r.kind).toBe("method-not-allowed");
    expect(r.allowedMethods).toEqual(["GET", "POST"]);
  });

  it("enforces host matching when declared", () => {
    const reg = new RouteRegistry([rule({ host: "api.example" })]);
    expect(match(reg, "/api/orgs/acme/invoices", "GET", "api.example")).not.toBeNull();
    expect(match(reg, "/api/orgs/acme/invoices", "GET", "other.example")).toBeNull();
  });
});
