import { describe, expect, it } from "vitest";

import { validateCatalog, validateRouteConfig } from "../../src/config/loader.js";
import { extractOrganizationId } from "../../src/routing/params.js";

const catalog = validateCatalog({
  version: 1,
  permissions: [{ name: "invoice.read" }],
});

const origin = { id: "erp", url: "https://api.example.com", secretEnvVar: "ORIGIN_ERP_SECRET", deadlineMs: 5000 };

describe("const organization source (per-org gateway)", () => {
  it("extractOrganizationId resolves const sources without params", () => {
    expect(extractOrganizationId("const.org_acme_erp", new Map())).toBe("org_acme_erp");
    expect(extractOrganizationId("const.org_acme_erp", new Map([["other", "x"]]))).toBe("org_acme_erp");
  });

  it("rejects invalid const identifiers", () => {
    expect(extractOrganizationId("const.", new Map())).toBeNull();
    expect(extractOrganizationId("const.../etc", new Map())).toBeNull();
  });

  it("path sources still work unchanged", () => {
    expect(extractOrganizationId("path.organizationId", new Map([["organizationId", "o1"]]))).toBe("o1");
  });

  it("config validation accepts const.orgId organizationIdFrom", () => {
    const config = validateRouteConfig(
      {
        origins: [origin],
        routes: [
          {
            id: "acme-invoices",
            method: "GET",
            "path": "/api/invoices",
            originId: "erp",
            destinationPath: "/v1/invoices",
            policy: {
              kind: "organization-permission",
              organizationIdFrom: "const.org_acme_erp",
              allOf: ["invoice.read"],
            },
          },
        ],
      },
      catalog,
    );
    expect(config.routes).toHaveLength(1);
  });

  it("config validation rejects malformed const sources", () => {
    expect(() =>
      validateRouteConfig(
        {
          origins: [origin],
          routes: [
            {
              id: "bad",
              method: "GET",
              "path": "/api/invoices",
              originId: "erp",
              destinationPath: "/v1/invoices",
              policy: {
                kind: "organization-permission",
                organizationIdFrom: "const.",
                allOf: ["invoice.read"],
              },
            },
          ],
        },
        catalog,
      ),
    ).toThrow(/organizationIdFrom/);
  });
});

describe("host.tenant source (shared-gateway tenant hostnames)", () => {
  it("resolves org from the tenant registry, ignoring params", () => {
    expect(
      extractOrganizationId("host.tenant", new Map(), { organizationId: "org_acme" }),
    ).toBe("org_acme");
    expect(extractOrganizationId("host.tenant", new Map())).toBeNull();
  });

  it("config validation accepts tenantHosts", () => {
    const config = validateRouteConfig(
      {
        origins: [origin],
        tenantHosts: [{ hostname: "acme.example.com", audience: "erp", organizationId: "org_acme_erp" }],
        routes: [
          {
            id: "t-invoices",
            method: "GET",
            path: "/api/invoices",
            originId: "erp",
            destinationPath: "/v1/invoices",
            policy: { kind: "organization-permission", organizationIdFrom: "host.tenant", allOf: ["invoice.read"] },
          },
        ],
      },
      catalog,
    );
    expect(config.tenantHosts).toHaveLength(1);
  });

  it("config validation rejects duplicate tenant hostnames", () => {
    expect(() =>
      validateRouteConfig(
        {
          origins: [origin],
          tenantHosts: [
            { hostname: "acme.example.com", audience: "erp", organizationId: "org1" },
            { hostname: "acme.example.com", audience: "erp", organizationId: "org2" },
          ],
          routes: [
            {
              id: "dummy",
              method: "GET",
              path: "/api/x",
              originId: "erp",
              destinationPath: "/v1/x",
              policy: { kind: "signed-in" },
            },
          ],
        },
        catalog,
      ),
    ).toThrow(/duplicate tenant hostname/);
  });
});
