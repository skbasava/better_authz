/**
 * Route-auth lint gate (adopted from Zuplo's compliance guidance):
 * every OpenAPI operation MUST declare a policy via x-gateway-route.
 * Routes intended to be public must carry an explicit
 * x-gateway-public: { reason } annotation — otherwise the build fails.
 */

export interface LintFinding {
  readonly where: string;
  readonly message: string;
}

interface OasOperation {
  readonly operationId?: string;
  readonly "x-gateway-route"?: unknown;
  readonly "x-gateway-public"?: unknown;
}

export function lintOpenapi(doc: unknown): readonly LintFinding[] {
  const findings: LintFinding[] = [];
  if (typeof doc !== "object" || doc === null) {
    return [{ where: "$", message: "OpenAPI document must be an object" }];
  }
  const paths = (doc as { paths?: unknown }).paths;
  if (typeof paths !== "object" || paths === null) {
    return [{ where: "$.paths", message: "OpenAPI document must define paths" }];
  }
  for (const [path, item] of Object.entries(paths)) {
    if (typeof item !== "object" || item === null) continue;
    for (const [method, op] of Object.entries(item as Record<string, unknown>)) {
      if (method === "parameters" || typeof op !== "object" || op === null) continue;
      const operation = op as OasOperation;
      const name = operation.operationId ?? `${method.toUpperCase()} ${path}`;
      const route = operation["x-gateway-route"];
      if (route === undefined) {
        findings.push({
          where: name,
          message: "missing x-gateway-route (no policy attached) — every route must declare one",
        });
        continue;
      }
      const ext = typeof route === "object" && route !== null ? (route as Record<string, unknown>) : {};
      const policy = ext.policy as { kind?: unknown; allOf?: unknown } | undefined;
      // Cross-app isolation on a shared gateway: org-permission names must be
      // prefixed with the route's audience (erp.invoice.read under "erp").
      const audience = typeof ext.audience === "string" ? ext.audience : undefined;
      if (
        audience !== undefined &&
        policy !== undefined &&
        policy.kind === "organization-permission" &&
        Array.isArray(policy.allOf)
      ) {
        for (const p of policy.allOf) {
          if (typeof p === "string" && !p.startsWith(`${audience}.`)) {
            findings.push({
              where: name,
              message: `permission "${p}" is not prefixed with route audience "${audience}" (cross-app isolation)`,
            });
          }
        }
      }
      if (policy !== undefined && policy.kind === "public") {
        const pub = operation["x-gateway-public"];
        const reason =
          typeof pub === "object" && pub !== null
            ? (pub as { reason?: unknown }).reason
            : undefined;
        if (typeof reason !== "string" || reason.trim() === "") {
          findings.push({
            where: name,
            message: 'public route requires x-gateway-public: { "reason": "..." }',
          });
        }
      }
    }
  }
  return findings;
}
