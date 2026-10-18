import type { PermissionCatalog } from "@gateway/shared";

export class UnknownPermissionError extends Error {
  constructor(name: string) {
    super(`unknown permission: ${name}`);
    this.name = "UnknownPermissionError";
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const PERMISSION_NAME = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/;

/** Parse and validate the permission catalog from the Worker's environment. */
export function loadCatalog(env: { PERMISSION_CATALOG: string }): PermissionCatalog {
  let raw: unknown;
  try {
    raw = JSON.parse(env.PERMISSION_CATALOG);
  } catch {
    throw new Error("PERMISSION_CATALOG is not valid JSON");
  }
  if (!isRecord(raw) || typeof raw.version !== "number" || !Number.isInteger(raw.version) || raw.version <= 0) {
    throw new Error("PERMISSION_CATALOG.version must be a positive integer");
  }
  if (!Array.isArray(raw.permissions)) throw new Error("PERMISSION_CATALOG.permissions must be an array");
  const seen = new Set<string>();
  for (const p of raw.permissions) {
    if (!isRecord(p) || typeof p.name !== "string" || !PERMISSION_NAME.test(p.name)) {
      throw new Error("invalid catalog permission entry");
    }
    if (seen.has(p.name)) throw new Error(`duplicate catalog permission: ${p.name}`);
    seen.add(p.name);
  }
  const permissions: { name: string; description?: string }[] = [];
  for (const p of raw.permissions) {
    const name = (p as { name: string }).name;
    const description = (p as { description?: unknown }).description;
    permissions.push(
      typeof description === "string" ? { name, description } : { name },
    );
  }
  return { version: raw.version, permissions };
}

/**
 * Fail-closed: any name outside the catalog throws UnknownPermissionError.
 * Call before evaluating any policy so stale/unknown permissions deny.
 */
export function assertKnownPermissions(names: readonly string[], catalog: PermissionCatalog): void {
  const known = new Set(catalog.permissions.map((p) => p.name));
  for (const name of names) {
    if (!known.has(name)) throw new UnknownPermissionError(name);
  }
}
