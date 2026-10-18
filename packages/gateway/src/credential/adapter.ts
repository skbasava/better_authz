// Extracts exactly one authentication credential from a request: an opaque
// session cookie OR a Bearer token. Ambiguous or malformed inputs are
// rejected. Credential values are used only for forwarding — never logged.

export type CredentialKind = "cookie" | "bearer";

export interface ExtractedCredential {
  readonly kind: CredentialKind;
  /** Original recognized cookie name (forwarded as Cookie: <name>=<value>). */
  readonly name?: string;
  /** Opaque value; never logged. */
  readonly value: string;
}

export type MalformedDetail =
  | "duplicate-session-cookie"
  | "empty-session-value"
  | "invalid-cookie-syntax"
  | "invalid-bearer-syntax";

export type CredentialResult =
  | { readonly status: "ok"; readonly credential: ExtractedCredential }
  | { readonly status: "none" }
  | { readonly status: "ambiguous" }
  | { readonly status: "malformed"; readonly detail: MalformedDetail };

interface CookieFinding {
  readonly kind: "cookie";
  readonly name: string;
  readonly value: string;
}

type Finding = CookieFinding | { readonly kind: "bearer"; readonly value: string };

function parseCookieHeader(header: string, sessionCookieNames: readonly string[]): CookieFinding[] {
  const recognized = new Set(sessionCookieNames);
  const findings: CookieFinding[] = [];
  for (const pair of header.split(";")) {
    const trimmed = pair.trim();
    if (trimmed === "") continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue; // not a name=value pair; cannot be a recognized cookie
    const name = trimmed.slice(0, eq).trim();
    if (!recognized.has(name)) continue; // exact-name match only, never substring
    findings.push({ kind: "cookie", name, value: trimmed.slice(eq + 1).trim() });
  }
  return findings;
}

function parseBearer(header: string | null): { readonly kind: "bearer"; readonly value: string } | null {
  if (header === null) return null;
  const match = /^Bearer[ \t]+(\S+)[ \t]*$/i.exec(header.trim());
  if (match === null || match[1] === undefined || match[1] === "") return null;
  return { kind: "bearer", value: match[1] };
}

export function extractCredential(
  request: Request,
  sessionCookieNames: readonly string[],
): CredentialResult {
  const cookieHeader = request.headers.get("Cookie");
  const cookies = cookieHeader === null ? [] : parseCookieHeader(cookieHeader, sessionCookieNames);

  if (cookies.length > 1) {
    return { status: "malformed", detail: "duplicate-session-cookie" };
  }
  const cookie = cookies[0];
  if (cookie !== undefined && cookie.value === "") {
    return { status: "malformed", detail: "empty-session-value" };
  }

  const bearer = parseBearer(request.headers.get("Authorization"));

  const findings: Finding[] = [
    ...(cookie === undefined ? [] : [cookie]),
    ...(bearer === null ? [] : [bearer]),
  ];

  if (findings.length === 0) {
    // Distinguish present-but-unparseable headers from true absence.
    const auth = request.headers.get("Authorization");
    if (auth !== null && auth.trim() !== "" && parseBearer(auth) === null) {
      return { status: "malformed", detail: "invalid-bearer-syntax" };
    }
    if (cookieHeader !== null && cookieHeader.trim() !== "" && cookies.length === 0) {
      const anyPair = cookieHeader.split(";").some((p) => {
        const t = p.trim();
        return t !== "" && t.indexOf("=") > 0;
      });
      if (!anyPair) return { status: "malformed", detail: "invalid-cookie-syntax" };
    }
    return { status: "none" };
  }

  if (findings.length > 1) {
    return { status: "ambiguous" }; // never choose one
  }

  const only = findings[0];
  if (only === undefined) return { status: "none" }; // unreachable; satisfies noUncheckedIndexedAccess

  if (only.kind === "bearer") {
    return { status: "ok", credential: { kind: "bearer", value: only.value } };
  }
  return { status: "ok", credential: { kind: "cookie", name: only.name, value: only.value } };
}
