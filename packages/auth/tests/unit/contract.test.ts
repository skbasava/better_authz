import { describe, expect, it } from "vitest";

import { buildAllowResponse, validateRequest } from "../../src/authorize/contract.js";

describe("validateRequest", () => {
  it("accepts valid bodies for each policy kind", () => {
    expect(
      validateRequest({ requestId: "r1", policy: { kind: "signed-in" } }),
    ).toEqual({ requestId: "r1", policy: { kind: "signed-in" } });

    expect(
      validateRequest({ requestId: "r2", policy: { kind: "global-role", allowedRoles: ["admin"] } }),
    ).toMatchObject({ policy: { kind: "global-role" } });

    expect(
      validateRequest({
        requestId: "r3",
        policy: { kind: "organization-permission", organizationId: "org1", allOf: ["invoice.read"] },
      }),
    ).toMatchObject({ policy: { kind: "organization-permission" } });
  });

  it.each([
    null,
    {},
    { requestId: "", policy: { kind: "signed-in" } },
    { requestId: "r", policy: { kind: "nope" } },
    { requestId: "r", policy: { kind: "global-role", allowedRoles: [] } },
    { requestId: "r", policy: { kind: "organization-permission", organizationId: "", allOf: ["a.b"] } },
    { requestId: "r", policy: { kind: "organization-permission", organizationId: "o", allOf: [] } },
  ])("rejects malformed body: %o", (bad) => {
    expect(validateRequest(bad)).toBeNull();
  });
});

describe("buildAllowResponse", () => {
  it("builds a conformant allow", () => {
    const allow = buildAllowResponse("r1", "u1", "s1", "u1", "2030-01-01T00:00:00Z", "org1");
    expect(allow).toEqual({
      contractVersion: 1,
      decision: "allow",
      user: { id: "u1" },
      session: { id: "s1", userId: "u1", expiresAt: "2030-01-01T00:00:00Z" },
      organizationId: "org1",
    });
  });

  it("omits organizationId when not an org policy", () => {
    const allow = buildAllowResponse("r1", "u1", "s1", "u1", "2030-01-01T00:00:00Z");
    expect("organizationId" in allow).toBe(false);
  });
});
