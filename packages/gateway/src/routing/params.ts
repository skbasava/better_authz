import type { OrganizationIdSource } from "@gateway/shared";

/**
 * Decoded path parameters must not reintroduce separators or invalid
 * identifier characters when re-encoded into destination URLs.
 */
const PARAM_VALUE_GRAMMAR = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export function isValidParamValue(value: string): boolean {
  return PARAM_VALUE_GRAMMAR.test(value);
}

/** Resolve `path.paramName` against matched route params. */
export function extractOrganizationId(
  source: OrganizationIdSource,
  params: ReadonlyMap<string, string>,
): string | null {
  const dot = source.indexOf(".");
  if (dot < 0 || dot === source.length - 1) return null;
  const value = params.get(source.slice(dot + 1));
  if (value === undefined || !isValidParamValue(value)) return null;
  return value;
}

/**
 * Build the backend destination path from a fixed template, replacing each
 * :placeholder with its individually percent-encoded validated value.
 * Returns null when a required parameter is missing or invalid.
 */
export function buildDestinationPath(
  template: string,
  params: ReadonlyMap<string, string>,
): string | null {
  if (template === "" || template.charAt(0) !== "/") return null;
  const out: string[] = [];
  for (const part of template.split("/")) {
    if (part === "") continue;
    if (part.startsWith(":")) {
      const value = params.get(part.slice(1));
      if (value === undefined || !isValidParamValue(value)) return null;
      out.push(encodeURIComponent(value));
    } else {
      out.push(part);
    }
  }
  return "/" + out.join("/");
}
