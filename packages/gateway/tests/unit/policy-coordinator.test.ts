import { describe, expect, it } from "vitest";

import { buildPolicy } from "../../src/policy/coordinator.js";

const params = new Map([["organizationId", "acme"]]);

describe("buildPolicy", () => {
  it("public routes never produce an authorize policy", () => {
    expect(buildPolicy({ kind: "public" }, params)).toEqual({ kind: "public" });
  });

  it("signed-in routes map directly", () => {
    expect(buildPolicy({ kind: "signed-in" }, params)).toEqual({
      kind: "policy",
      policy: { kind: "signed-in" },
    });
  });

  it("global-role routes carry the declared role list", () => {
    expect(buildPolicy({ kind: "global-role", allowedRoles: ["admin"] }, params)).toEqual({
      kind: "policy",
      policy: { kind: "global-role", allowedRoles: ["admin"] },
    });
  });

  it("organization routes resolve the org id from path params", () => {
    expect(
      buildPolicy(
        {
          kind: "organization-permission",
          organizationIdFrom: "path.organizationId",
          allOf: ["invoice.read"],
        },
        params,
      ),
    ).toEqual({
      kind: "policy",
      policy: { kind: "organization-permission", organizationId: "acme", allOf: ["invoice.read"] },
    });
  });

  it("rejects missing organization context before authorization", () => {
    const result = buildPolicy(
      {
        kind: "organization-permission",
        organizationIdFrom: "path.organizationId",
        allOf: ["invoice.read"],
      },
      new Map(),
    );
    expect(result).toEqual({ kind: "invalid-organization-context" });
  });

  it("rejects invalid organization identifiers", () => {
    const result = buildPolicy(
      {
        kind: "organization-permission",
        organizationIdFrom: "path.organizationId",
        allOf: ["invoice.read"],
      },
      new Map([["organizationId", "../escape"]]),
    );
    expect(result).toEqual({ kind: "invalid-organization-context" });
  });
});
