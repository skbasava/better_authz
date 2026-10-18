import { describe, expectTypeOf, it } from "vitest";
import type {
  AuthorizeAllow,
  AuthorizeRequestBody,
  ErrorCode,
  GatewayError,
  OrganizationIdSource,
  PolicyConfig,
  PolicyRequest,
} from "@gateway/shared";

describe("PolicyRequest contract", () => {
  it("public_policy_cannot_be_authorize_request", () => {
    const routePolicy = { kind: "public" } as const satisfies PolicyConfig;

    // @ts-expect-error — a public route policy is never sent to the Auth Worker.
    const authorizePolicy: PolicyRequest = routePolicy;

    expectTypeOf(authorizePolicy).not.toMatchTypeOf<never>();
  });

  it("signed-in policy round-trips", () => {
    const body = {
      requestId: "6f1c2a4e-8f4b-4a6c-b3f2-2d8e9a1c5b7d",
      policy: { kind: "signed-in" },
    } as const satisfies AuthorizeRequestBody;

    expectTypeOf(body.policy.kind).toEqualTypeOf<"signed-in">();
  });

  it("organization-permission requires organizationId and allOf", () => {
    expectTypeOf<
      Extract<PolicyRequest, { kind: "organization-permission" }>
    >().toHaveProperty("organizationId").toBeString();

    expectTypeOf<
      Extract<PolicyRequest, { kind: "organization-permission" }>
    >().toHaveProperty("allOf").toMatchTypeOf<readonly string[]>();
  });
});

describe("AuthorizeAllow contract", () => {
  it("pins contractVersion to literal 1", () => {
    expectTypeOf<AuthorizeAllow["contractVersion"]>().toEqualTypeOf<1>();
    expectTypeOf<AuthorizeAllow["decision"]>().toEqualTypeOf<"allow">();
  });

  it("session carries userId and expiresAt", () => {
    expectTypeOf<AuthorizeAllow["session"]>().toHaveProperty("userId").toBeString();
    expectTypeOf<AuthorizeAllow["session"]>().toHaveProperty("expiresAt").toBeString();
  });
});

describe("ErrorCode union", () => {
  it("error_codes_cover_all_gateway_errors", () => {
    const all: readonly ErrorCode[] = [
      "NO_CREDENTIAL",
      "INVALID_SESSION",
      "SESSION_EXPIRED",
      "FORBIDDEN",
      "AMBIGUOUS_CREDENTIAL",
      "MALFORMED_CREDENTIAL",
      "AUTH_UNAVAILABLE",
      "BAD_AUTH_RESPONSE",
      "BACKEND_UNAVAILABLE",
      "BACKEND_TIMEOUT",
      "PAYLOAD_TOO_LARGE",
      "RATE_LIMITED",
      "WEBSOCKET_NOT_SUPPORTED",
      "NOT_FOUND",
      "INTERNAL_ERROR",
    ];

    expectTypeOf(all).toMatchTypeOf<readonly ErrorCode[]>();
    expectTypeOf<GatewayError["code"]>().toEqualTypeOf<ErrorCode>();

    // @ts-expect-error — not a Revision 3 gateway error code.
    const bogus: ErrorCode = "UNAUTHORIZED";

    expectTypeOf(bogus).not.toMatchTypeOf<never>();
  });
});

describe("OrganizationIdSource", () => {
  it("organization_source_requires_path_prefix", () => {
    // Positive case enforced by `satisfies` at compile time.
    const ok = "path.organizationId" as const satisfies OrganizationIdSource;
    expectTypeOf(ok).toBeString();

    // @ts-expect-error — organization context must come from a declared path param.
    const bad = "query.organizationId" as const satisfies OrganizationIdSource;

    expectTypeOf(bad).not.toMatchTypeOf<never>();
  });
});
