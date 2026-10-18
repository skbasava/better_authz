import { STRIPPED_INBOUND_HEADERS, isXForwardedHeader } from "./headers.js";

/**
 * Return a NEW Headers instance with untrusted inbound headers removed.
 * Never mutates the input. The caller must read CF-Connecting-IP before
 * stripping and store it in context; this function removes it.
 */
export function stripInboundHeaders(headers: Headers): Headers {
  const stripped = new Set(STRIPPED_INBOUND_HEADERS.map((h) => h.toLowerCase()));
  const out = new Headers();
  headers.forEach((value, name) => {
    const lower = name.toLowerCase();
    if (stripped.has(lower)) return;
    if (isXForwardedHeader(lower)) return;
    if (lower === "cf-connecting-ip") return;
    out.append(name, value);
  });
  return out;
}
