// Runtime header constant arrays. Revision 3 sketched these in shared, but
// Task 1 makes shared compile-time-only, so they live here. Keep the
// IdentityHeaderName union in @gateway/shared/contracts in sync with
// IDENTITY_HEADER_NAMES.

export const IDENTITY_HEADER_NAMES = [
  "Gateway-User-Id",
  "Gateway-Session-Id",
  "Gateway-Organization-Id",
  "Gateway-Request-Id",
  "Gateway-Policy-Id",
  "Gateway-Origin-Auth",
] as const;

export const STRIPPED_INBOUND_HEADERS: readonly string[] = [
  ...IDENTITY_HEADER_NAMES,
  "X-User-Id",
  "X-Session-Id",
  "X-Organization-Id",
  "X-Policy-Id",
  "X-Gateway-Origin-Auth",
  "X-Gateway-Client-IP",
  "X-Request-Id",
  "Forwarded",
  "X-Real-IP",
  // X-Forwarded-* handled by case-insensitive prefix match at runtime.
] as const;

const X_FORWARDED_PREFIX = "x-forwarded-";

export function isXForwardedHeader(name: string): boolean {
  return name.toLowerCase().startsWith(X_FORWARDED_PREFIX);
}
