import type { InboundPolicy, PolicyContext, PolicyRegistry } from "./types.js";

export type ChainOutcome =
  | { readonly kind: "continue"; readonly request: Request }
  | { readonly kind: "responded"; readonly response: Response };

/**
 * Execute an ordered policy chain. First policy to return a Response wins
 * (short-circuit); policies returning a Request pass it (possibly rebuilt)
 * to the next. An unknown policy name is a config-time error surfaced here
 * as a 500 — fail closed, never skip.
 */
export async function runPolicyChain(
  names: readonly string[],
  registry: PolicyRegistry,
  request: Request,
  context: PolicyContext,
): Promise<ChainOutcome> {
  let current = request;
  for (const name of names) {
    const policy = registry.get(name);
    if (policy === undefined) {
      return {
        kind: "responded",
        response: Response.json(
          { code: "INTERNAL_ERROR", message: `Unknown policy: ${name}`, requestId: context.requestId },
          { status: 500, headers: { "Cache-Control": "no-store" } },
        ),
      };
    }
    const result = await policy(current, context);
    if (result instanceof Response) {
      return { kind: "responded", response: result };
    }
    current = result;
  }
  return { kind: "continue", request };
}
