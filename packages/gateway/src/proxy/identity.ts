import type { AuthorizeAllow } from "@gateway/shared";

/**
 * Build headers carrying ONLY origin authentication and the gateway request
 * ID — for public routes. No user/session/organization identity is invented.
 */
export function buildPublicIdentityHeaders(requestId: string, originAuth: string): Headers {
  const headers = new Headers();
  headers.set("Gateway-Origin-Auth", originAuth); // secret value — never logged
  headers.set("Gateway-Request-Id", requestId);
  return headers;
}

/**
 * Build trusted gateway identity headers for an ALLOWED request.
 * Only call for non-public policies. Never set user/session headers on
 * public routes.
 */
export function buildIdentityHeaders(
  authResult: AuthorizeAllow,
  requestId: string,
  policyId: string,
  originAuth: string,
): Headers {
  const headers = new Headers();
  headers.set("Gateway-Origin-Auth", originAuth); // secret value — never logged
  headers.set("Gateway-Request-Id", requestId);
  headers.set("Gateway-User-Id", authResult.user.id);
  headers.set("Gateway-Session-Id", authResult.session.id);
  headers.set("Gateway-Policy-Id", policyId);
  if (authResult.organizationId !== undefined) {
    headers.set("Gateway-Organization-Id", authResult.organizationId);
  }
  return headers;
}
