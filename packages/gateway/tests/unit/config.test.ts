import { describe, expect, it } from "vitest";

import { GatewayConfigError, validateCatalog, validateRouteConfig } from "../../src/config/loader.js";

const catalog = validateCatalog({
  version: 1,
  permissions: [
    { name: "invoice.read" },
    { name: "invoice.write", description: "create invoices" },
  ],
});

const origin = { id: "billing", url: "https://billing.example", secretEnvVar: "ORIGIN_BILLING_SECRET", deadlineMs: 2000 };

function route(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "list-invoices",
    method: "GET",
    path: "/api/orgs/:organizationId/invoices",
    originId: "billing",
    destinationPath: "/v1/orgs/:organizationId/invoices",
    policy: { kind: "organization-permission", organizationIdFrom: "path.organizationId", allOf: ["invoice.read"] },
    ...overrides,
  };
}

describe("validateCatalog", () => {
  it("rejects invalid names and duplicates", () => {
    expect(() => validateCatalog({ version: 1, permissions: [{ name: "Bad Name" }] })).toThrow(GatewayConfigError);
    expect(() =>
      validateCatalog({ version: 1, permissions: [{ name: "a.b" }, { name: "a.b" }] }),
    ).toThrow(GatewayConfigError);
  });
});

describe("validateRouteConfig", () => {
  it("accepts a valid config", () => {
    const config = validateRouteConfig({ origins: [origin], routes: [route()] }, catalog);
    expect(config.routes).toHaveLength(1);
  });

  it("rejects duplicate route ids", () => {
    expect(() => validateRouteConfig({ origins: [origin], routes: [route(), route()] }, catalog)).toThrow(/duplicate route id/);
  });

  it("rejects unknown origin references", () => {
    expect(() =>
      validateRouteConfig({ origins: [origin], routes: [route({ originId: "nope" })] }, catalog),
    ).toThrow(/unknown origin/);
  });

  it("rejects unknown catalog permissions", () => {
    expect(() =>
      validateRouteConfig(
        { origins: [origin], routes: [route({ policy: { kind: "organization-permission", organizationIdFrom: "path.organizationId", allOf: ["invoice.delete"] } })] },
        catalog,
      ),
    ).toThrow(/unknown catalog permission/);
  });

  it("rejects org sources that are not declared path params", () => {
    expect(() =>
      validateRouteConfig(
        { origins: [origin], routes: [route({ policy: { kind: "organization-permission", organizationIdFrom: "path.otherId", allOf: ["invoice.read"] } })] },
        catalog,
      ),
    ).toThrow(/unknown path param/);
  });

  it("rejects non-https origins and trailing slashes", () => {
    for (const bad of ["http://x.example", "https://x.example/"]) {
      expect(() =>
        validateRouteConfig({ origins: [{ ...origin, url: bad }], routes: [route()] }, catalog),
      ).toThrow(GatewayConfigError);
    }
  });

  it("rejects reserved namespaces", () => {
    expect(() => validateRouteConfig({ origins: [origin], routes: [route({ path: "/api/auth/x" })] }, catalog)).toThrow(/reserved/);
    expect(() => validateRouteConfig({ origins: [origin], routes: [route({ path: "/_internal/x" })] }, catalog)).toThrow(/_internal/);
  });

  it("rejects out-of-range deadlines", () => {
    expect(() => validateRouteConfig({ origins: [{ ...origin, deadlineMs: 0 }], routes: [route()] }, catalog)).toThrow(GatewayConfigError);
    expect(() => validateRouteConfig({ origins: [{ ...origin, deadlineMs: 30001 }], routes: [route()] }, catalog)).toThrow(GatewayConfigError);
  });

  it("rejects repeated slashes in paths", () => {
    expect(() => validateRouteConfig({ origins: [origin], routes: [route({ path: "/a//b" })] }, catalog)).toThrow(/repeated/);
  });
});
