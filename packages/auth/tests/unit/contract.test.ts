import { describe, expect, it } from "vitest";

import { buildAllowResponse, validateRequest } from "../../src/authorize/contract.js";

describe("validateRequest", () => {
  it("accepts valid bodies for each policy kind", () => {
    expect(
      validateRequest({ requestId: "r1", audience: "erp", policy: { kind: "signed-in" } }),
    ).toEqual({ requestId: "r1", audience: "erp", policy: { kind: "signed-in" } });

    expect(
      validateRequest({ requestId: "r1", audience: "erp", policy: { kind: "app-access" } }),
    ).toEqual({ requestId: "r1", audience: "erp", policy: { kind: "app-access" } });

    expect(
      validateRequest({ requestId: "r2", audience: "erp", policy: { kind: "global-role", allowedRoles: ["admin"] } }),
    ).toMatchObject({ policy: { kind: "global-role" } });

    expect(
      validateRequest({
        requestId: "r3",
        audience: "erp",
        policy: { kind: "organization-permission", organizationId: "org1", allOf: ["invoice.read"] },
      }),
    ).toMatchObject({ policy: { kind: "organization-permission" } });
  });

  it("defaults a missing audience (transitional pre-A1 leniency)", () => {
    expect(
      validateRequest({ requestId: "r1", policy: { kind: "signed-in" } }),
    ).toEqual({ requestId: "r1", audience: "default", policy: { kind: "signed-in" } });
  });

  it.each([
    null,
    {},
    { requestId: "", audience: "erp", policy: { kind: "signed-in" } },
    { requestId: "r", audience: "erp", policy: { kind: "nope" } },
    { requestId: "r", audience: "erp", policy: { kind: "global-role", allowedRoles: [] } },
    { requestId: "r", audience: "erp", policy: { kind: "organization-permission", organizationId: "", allOf: ["a.b"] } },
  ])("rejects malformed body: %o", (bad) => {
    expect(validateRequest(bad)).toBeNull();
  });
});

describe("buildAllowResponse", () => {
  it("builds a conformant allow", () => {
    expect(buildAllowResponse("r1", "u1", "s1", "u1", "2030-01-01T00:00:00Z", "org1")).toEqual({
      contractVersion: 1,
      decision: "allow",
      user: { id: "u1" },
      session: { id: "s1", userId: "u1", expiresAt: "2030-01-01T00:00:00Z" },
      organizationId: "org1",
    });
  });

  it("omits organizationId for non-org policies", () => {
    expect("organizationId" in buildAllowResponse("r1", "u1", "s1", "u1", "2030-01-01T00:00:00Z")).toBe(false);
  });
});
