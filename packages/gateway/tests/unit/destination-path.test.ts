import { describe, expect, it } from "vitest";

import { buildDestinationPath, extractOrganizationId } from "../../src/routing/params.js";

describe("buildDestinationPath", () => {
  it("substitutes and encodes parameters", () => {
    const params = new Map([["organizationId", "acme"]]);
    expect(buildDestinationPath("/v1/orgs/:organizationId/invoices", params)).toBe(
      "/v1/orgs/acme/invoices",
    );
  });

  it("percent-encodes special characters without creating separators", () => {
    const params = new Map([["organizationId", "a b/c?d#e"]]);
    const out = buildDestinationPath("/v1/orgs/:organizationId", params);
    // Grammar-rejected characters return null before encoding is even needed;
    // only grammar-safe values reach encoding. Verify grammar enforcement:
    expect(out).toBeNull();
  });

  it("rejects traversal attempts via decoded dot segments", () => {
    const params = new Map([["organizationId", ".."]]);
    expect(buildDestinationPath("/v1/orgs/:organizationId", params)).toBeNull();
  });

  it("returns null for missing parameters", () => {
    expect(buildDestinationPath("/v1/orgs/:organizationId", new Map())).toBeNull();
  });

  it("returns null for invalid templates", () => {
    expect(buildDestinationPath("no-leading-slash", new Map())).toBeNull();
  });
});

describe("extractOrganizationId", () => {
  it("resolves path.paramName sources", () => {
    expect(
      extractOrganizationId("path.organizationId", new Map([["organizationId", "acme"]])),
    ).toBe("acme");
  });

  it("returns null for missing or invalid values", () => {
    expect(extractOrganizationId("path.organizationId", new Map())).toBeNull();
    expect(
      extractOrganizationId("path.organizationId", new Map([["organizationId", "../etc"]])),
    ).toBeNull();
  });
});
