// ---------------------------------------------------------------------------
// Permission catalog — application-defined, dotted resource.action notation.
// ---------------------------------------------------------------------------

export interface CatalogPermission {
  /** e.g. "invoice.read" */
  readonly name: string;
  readonly description?: string;
}

export interface PermissionCatalog {
  readonly version: number;
  readonly permissions: readonly CatalogPermission[];
}

// NOTE: the spec sketch's catalogPermissionNames() helper is runtime code.
// Per the Task 1 "types-only" constraint it is NOT exported here; consumers
// (packages/auth/src/catalog, packages/gateway/src/config/loader) define
// their own typed helpers.
