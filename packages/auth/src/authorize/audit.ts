import type { AuditEmitter, AuthorizationEvent } from "./ports.js";

/**
 * Structured audit log of authorization decisions — the P0 observability
 * row of the architecture assessment. Emits to Worker logs (visible via
 * `wrangler tail` / Logpush). Fire-and-forget: an audit failure must never
 * change an allow/deny decision.
 */
export function createConsoleAuditEmitter(): AuditEmitter {
  return {
    emit: (event: AuthorizationEvent) => {
      console.log(JSON.stringify({ level: "audit", ...event }));
    },
  };
}
