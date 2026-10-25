import { describe, expect, it } from "vitest";
import type { PermissionCatalog } from "@gateway/shared";

import { evaluatePolicy } from "../../src/authorize/policy.js";
import type { ApplicationResolver, MembershipResolver, PolicyPorts } from "../../src/authorize/ports.js";
import type { ResolvedSession } from "../../src/authorize/session.js";

const catalog: PermissionCatalog = {
  version: 1,
  permissions: [{ name: "invoice.read" }, { name: "invoice.write" }],
};

const session = (userId = "u1", platformRole: string | null = null): ResolvedSession => ({
  userId,
  sessionId: "s1",
  expiresAt: "2030-01-01T00:00:00Z",
  platformRole,
  renewalCookies: [],
});

const appResolver = (overrides: Partial<ApplicationResolver> = {}): ApplicationResolver => ({
  resolveNamespace: async (a) => (a === "erp" ? "erp" : null),
  orgBelongsTo: async (org, a) => a === "erp" && org === "o1",
  hasAnyMembership: async (userId, a) => a === "erp" && userId === "u1",
  ...overrides,
});

const ports = (
  membership: MembershipResolver | null,
  application: ApplicationResolver = appResolver(),
  audience = "erp",
): PolicyPorts => ({ audience, application, membership });

const reader = (perms: readonly string[] | null): MembershipResolver => ({
  getMembershipPermissions: async () => perms,
});

describe("layered evaluation", () => {
  it("layer 1: signed-in allows any valid enabled session", async () => {
    const d = await evaluatePolicy({ kind: "signed-in" }, session("anyone"), ports(null), catalog);
    expect(d).toEqual({ kind: "allow" });
  });

  it("layer 2: app-access allows members of any org of the audience", async () => {
    const ok = await evaluatePolicy({ kind: "app-access" }, session("u1"), ports(null), catalog);
    expect(ok).toEqual({ kind: "allow" });

    const noMembership = await evaluatePolicy({ kind: "app-access" }, session("u2"), ports(null), catalog);
    expect(noMembership).toEqual({ kind: "deny", code: "FORBIDDEN", layer: "app" });
  });

  it("layer 2: unknown audience denies (fail closed)", async () => {
    const d = await evaluatePolicy({ kind: "app-access" }, session("u1"), ports(null, appResolver(), "nope"), catalog);
    expect(d).toEqual({ kind: "deny", code: "FORBIDDEN", layer: "app" });
  });

  it("layer 2: org-permission on an org that belongs to ANOTHER app denies", async () => {
    const d = await evaluatePolicy(
      { kind: "organization-permission", organizationId: "o1", allOf: ["invoice.read"] },
      session("u1"),
      ports(reader(["invoice.read"]), appResolver({ orgBelongsTo: async () => false })),
      catalog,
    );
    expect(d).toEqual({ kind: "deny", code: "FORBIDDEN", layer: "app" });
  });

  it("global-role checks the platform role only, denies with layer permission", async () => {
    expect(
      await evaluatePolicy({ kind: "global-role", allowedRoles: ["admin"] }, session("u1", "admin"), ports(null), catalog),
    ).toEqual({ kind: "allow" });
    expect(
      await evaluatePolicy({ kind: "global-role", allowedRoles: ["admin"] }, session("u1", "member"), ports(null), catalog),
    ).toEqual({ kind: "deny", code: "FORBIDDEN", layer: "permission" });
  });

  it("layer 3: non-member denies with layer membership", async () => {
    const d = await evaluatePolicy(
      { kind: "organization-permission", organizationId: "o1", allOf: ["invoice.read"] },
      session("u1"),
      ports(reader(null)),
      catalog,
    );
    expect(d).toEqual({ kind: "deny", code: "FORBIDDEN", layer: "membership" });
  });

  it("layer 3: member with all permissions allows", async () => {
    const d = await evaluatePolicy(
      { kind: "organization-permission", organizationId: "o1", allOf: ["invoice.read"] },
      session("u1"),
      ports(reader(["invoice.read", "invoice.write"])),
      catalog,
    );
    expect(d).toEqual({ kind: "allow" });
  });

  it("layer 3: missing permission denies with layer permission", async () => {
    const d = await evaluatePolicy(
      { kind: "organization-permission", organizationId: "o1", allOf: ["invoice.write"] },
      session("u1"),
      ports(reader(["invoice.read"])),
      catalog,
    );
    expect(d).toEqual({ kind: "deny", code: "FORBIDDEN", layer: "permission" });
  });

  it("catalog skew: unknown requested OR stored permission denies", async () => {
    const requested = await evaluatePolicy(
      { kind: "organization-permission", organizationId: "o1", allOf: ["invoice.delete"] },
      session("u1"),
      ports(reader(["invoice.delete"])),
      catalog,
    );
    expect(requested).toEqual({ kind: "deny", code: "FORBIDDEN", layer: "permission" });

    const stored = await evaluatePolicy(
      { kind: "organization-permission", organizationId: "o1", allOf: ["invoice.read"] },
      session("u1"),
      ports(reader(["invoice.read", "ghost.permission"])),
      catalog,
    );
    expect(stored).toEqual({ kind: "deny", code: "FORBIDDEN", layer: "permission" });
  });
});
