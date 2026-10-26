import type { CompactSchema } from "@gateway/shared";

import { readAndValidateBody, ValidationBodyTooLarge } from "./validate-request.js";
import type { InboundPolicy, PolicyRegistry, RouteValidationOptions } from "./types.js";

/**
 * Built-in optional policy registry. Members here are ADDITIONS to the
 * mandatory core (which lives in app.ts and is never config-driven).
 */
export function createBuiltinRegistry(
  options: {
    readonly requestValidation: (routeId: string) => RouteValidationOptions | undefined;
  },
): PolicyRegistry {
  const policies = new Map<string, InboundPolicy>();

  policies.set("request-validation", async (request, context) => {
    const cfg = options.requestValidation(context.routeId);
    if (cfg === undefined || request.body === null) return request;
    try {
      const checked = await readAndValidateBody(request, cfg.schema, cfg.maxBodyBytes ?? 1_048_576);
      if (!checked.result.valid) {
        if (cfg.mode === "reject") {
          return Response.json(
            {
              code: "MALFORMED_CREDENTIAL",
              message: `Request validation failed: ${checked.result.errors.join("; ")}`,
              requestId: context.requestId,
            },
            { status: 400, headers: { "Cache-Control": "no-store" } },
          );
        }
        console.log(JSON.stringify({
          level: "warn", requestId: context.requestId, routeId: context.routeId,
          message: "request-validation violations (log mode)", errors: checked.result.errors,
        }));
      }
      return checked.request;
    } catch (err) {
      if (err instanceof ValidationBodyTooLarge) {
        return Response.json(
          { code: "PAYLOAD_TOO_LARGE", message: "Request body exceeds the validation buffer limit", requestId: context.requestId },
          { status: 413, headers: { "Cache-Control": "no-store" } },
        );
      }
      throw err;
    }
  });

  return { get: (name) => policies.get(name) };
}

export type { CompactSchema };
