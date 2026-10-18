import { describe, expect, it } from "vitest";
import type { PermissionCatalog } from "@gateway/shared";

import { evaluatePolicy, type OrgPermissionReader } from "../../src/authorize/policy.js";
import type { ResolvedSession } from "../../src/authorize/session.js";

const catalog: PermissionCatalog = {
  version: 1,
  permissions: [{ name: "invoice.read" }, { name: "invoice.write" }],
};

const session = (platformRole: string | null): ResolvedSession => ({
  userId: "u1",
  sessionId: "s1",
  expiresAt: "2030-01-01T00:00:00Z",
  platformRole,
  renewalCookies: [],
});

const reader = (perms: readonly string[] | null): OrgPermissionReader => ({
  getMembershipPermissions: async () => perms,
});

describe("evaluatePolicy", () => {
  it("signed-in allows any valid session", async () => {
    const d = await evaluatePolicy({ kind: "signed-in" }, session(null), reader(null), catalog);
    expect(d).toEqual({ kind: "allow" });
  });

  it("global-role checks the platform role only", async () => {
    expect(
      await evaluatePolicy({ kind: "global-role", allowedRoles: ["admin"] }, session("admin"), reader(null), catalog),
    ).toEqual({ kind: "allow" });
    expect(
      await evaluatePolicy({ kind: "global-role", allowedRoles: ["admin"] }, session("member"), reader(null), catalog),
    ).toEqual({ kind: "deny", code: "FORBIDDEN" });
  });

  it("organization-permission requires membership and all permissions", async () => {
    const ok = await evaluatePolicy(
      { kind: "organization-permission", organizationId: "o1", allOf: ["invoice.read"] },
      session(null),
      reader(["invoice.read", "invoice.write"]),
      catalog,
    );
    expect(ok).toEqual({ kind: "allow" });

    const missing = await evaluatePolicy(
      { kind: "organization-permission", organizationId: "o1", allOf: ["invoice.write"] },
      session(null),
      reader(["invoice.read"]),
      catalog,
    );
    expect(missing).toEqual({ kind: "deny", code: "FORBIDDEN" });

    const nonMember = await evaluatePolicy(
      { kind: "organization-permission", organizationId: "o1", allOf: ["invoice.read"] },
      session(null),
      reader(null),
      catalog,
    );
    expect(nonMember).toEqual({ kind: "deny", code: "FORBIDDEN" });
  });

  it("fails closed on unknown requested permissions (catalog skew)", async () => {
    const d = await evaluatePolicy(
      { kind: "organization-permission", organizationId: "o1", allOf: ["invoice.delete"] },
      session(null),
      reader(["invoice.delete"]),
      catalog,
    );
    expect(d).toEqual({ kind: "deny", code: "FORBIDDEN" });
  });

  it("fails closed when a stored role contains names outside the current catalog", async () => {
    const d = await evaluatePolicy(
      { kind: "organization-permission", organizationId: "o1", allOf: ["invoice.read"] },
      session(null),
      reader(["invoice.read", "ghost.permission"]),
      catalog,
    );
    expect(d).toEqual({ kind: "deny", code: "FORBIDDEN" });
  });
});
