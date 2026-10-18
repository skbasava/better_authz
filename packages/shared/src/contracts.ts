// ---------------------------------------------------------------------------
// Authorize request (Gateway -> Auth Worker)
// ---------------------------------------------------------------------------

export type PolicyRequest =
  | { readonly kind: "signed-in" }
  | { readonly kind: "global-role"; readonly allowedRoles: readonly string[] }
  | {
      readonly kind: "organization-permission";
      readonly organizationId: string;
      readonly allOf: readonly string[];
    };

export interface AuthorizeRequestBody {
  /** Gateway-generated UUID (crypto.randomUUID()). */
  readonly requestId: string;
  readonly policy: PolicyRequest;
}

// ---------------------------------------------------------------------------
// Authorize allow response (Auth Worker -> Gateway, HTTP 200)
// ---------------------------------------------------------------------------

export interface AuthorizeAllow {
  readonly contractVersion: 1;
  readonly decision: "allow";
  readonly user: { readonly id: string };
  readonly session: {
    readonly id: string;
    /** Must equal user.id; the gateway validates this. */
    readonly userId: string;
    /** RFC 3339 UTC; must be a valid future timestamp. */
    readonly expiresAt: string;
  };
  /** Present iff policy.kind === "organization-permission". */
  readonly organizationId?: string;
}

// ---------------------------------------------------------------------------
// Gateway error body (gateway-generated; forwarded auth denials)
// Full Revision 3 union, including route-level codes used by app.ts.
// ---------------------------------------------------------------------------

export type ErrorCode =
  | "NO_CREDENTIAL"
  | "INVALID_SESSION"
  | "SESSION_EXPIRED"
  | "FORBIDDEN"
  | "AMBIGUOUS_CREDENTIAL"
  | "MALFORMED_CREDENTIAL"
  | "AUTH_UNAVAILABLE"
  | "BAD_AUTH_RESPONSE"
  | "BACKEND_UNAVAILABLE"
  | "BACKEND_TIMEOUT"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "WEBSOCKET_NOT_SUPPORTED"
  | "NOT_FOUND"
  | "INTERNAL_ERROR";

export interface GatewayError {
  readonly code: ErrorCode;
  readonly message: string;
  readonly requestId: string;
}

// ---------------------------------------------------------------------------
// Trusted identity headers (Gateway -> backend)
//
// Task 1 constraint: this package is compile-time contracts only — no runtime
// constants. The runtime arrays IDENTITY_HEADER_NAMES and
// STRIPPED_INBOUND_HEADERS therefore live in the gateway package
// (packages/gateway/src/proxy/headers.ts). Keep this union in sync with
// that array.
// ---------------------------------------------------------------------------

export type IdentityHeaderName =
  | "Gateway-User-Id"
  | "Gateway-Session-Id"
  | "Gateway-Organization-Id"
  | "Gateway-Request-Id"
  | "Gateway-Policy-Id"
  | "Gateway-Origin-Auth";
