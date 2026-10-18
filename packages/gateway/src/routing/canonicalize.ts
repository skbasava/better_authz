// Specification section 4 — canonical paths, five-step algorithm.
//
// Platform URL parsers may normalize literal dot segments before Worker code
// receives the URL. Do not claim those spellings can always be detected.
// Test normalization in integration tests.

export interface CanonicalPath {
  readonly segments: readonly string[];
  readonly hasTrailingSlash: boolean;
}

const HEX_PAIR = /^[0-9A-Fa-f]{2}$/;

/** Step 1 — pre-decode validation of encoded bytes. */
function hasForbiddenEncoding(raw: string): boolean {
  for (let i = 0; i < raw.length; i += 1) {
    if (raw.charAt(i) !== "%") continue;
    const pair = raw.slice(i + 1, i + 3);
    if (pair.length !== 2 || !HEX_PAIR.test(pair)) return true;
    const byte = parseInt(pair, 16);
    // %00-%1F and %7F controls; %2F '/' and %5C '\' rejected pre-decode.
    if (byte <= 0x1f || byte === 0x7f || byte === 0x2f || byte === 0x5c) return true;
    i += 2;
  }
  return false;
}

/** Step 2 — split and decode each segment exactly once. */
function decodeSegments(raw: string): string[] | null {
  const parts = raw.split("/");
  const segments: string[] = [];
  for (let i = 1; i < parts.length; i += 1) {
    const part = parts[i];
    if (part === undefined || part === "") continue;
    let decoded: string;
    try {
      decoded = decodeURIComponent(part);
    } catch {
      return null;
    }
    for (let j = 0; j < decoded.length; j += 1) {
      const ch = decoded.charAt(j);
      const code = decoded.charCodeAt(j);
      // reject separators, controls, non-ASCII, remaining '%' (double encoding)
      if (ch === "/" || ch === "\\" || ch === "%") return null;
      if (code <= 0x1f || code === 0x7f || code > 0x7e) return null;
    }
    segments.push(decoded);
  }
  return segments;
}

export function canonicalizePath(rawPathname: string): CanonicalPath | null {
  if (rawPathname === "" || rawPathname.charAt(0) !== "/") return null;
  if (hasForbiddenEncoding(rawPathname)) return null;
  if (rawPathname.includes("//")) return null; // step 3 — repeated slashes
  const segments = decodeSegments(rawPathname);
  if (segments === null) return null;
  const hasTrailingSlash = rawPathname.length > 1 && rawPathname.endsWith("/");
  return { segments, hasTrailingSlash };
}
