import type { RouteRule } from "@gateway/shared";

import type { CanonicalPath } from "./canonicalize.js";

export interface RouteMatch {
  readonly rule: RouteRule;
  /** Decoded param name -> decoded value. */
  readonly params: ReadonlyMap<string, string>;
}

export interface MethodNotAllowed {
  readonly kind: "method-not-allowed";
  readonly allowedMethods: readonly string[];
}

export type MatchOutcome = RouteMatch | MethodNotAllowed | null;

type Segment = { readonly literal: string } | { readonly param: string };

export interface CompiledRoute {
  readonly rule: RouteRule;
  readonly host: string | null;
  readonly methods: readonly string[];
  readonly segments: readonly Segment[];
  readonly hasTrailingSlash: boolean;
}

function compilePattern(path: string): readonly Segment[] {
  const out: Segment[] = [];
  for (const part of path.split("/")) {
    if (part === "") continue;
    if (part.startsWith(":")) out.push({ param: part.slice(1) });
    else out.push({ literal: part });
  }
  return out;
}

export class RouteRegistry {
  private readonly routes: readonly CompiledRoute[];

  constructor(rules: readonly RouteRule[]) {
    this.routes = rules.map((rule) => {
      const methods = (typeof rule.method === "string" ? [rule.method] : rule.method).map((m) =>
        m.toUpperCase(),
      );
      return {
        rule,
        host: rule.host ?? null,
        methods,
        segments: compilePattern(rule.path),
        hasTrailingSlash: rule.path.length > 1 && rule.path.endsWith("/"),
      };
    });
  }

  /**
   * - null             -> no path match (404)
   * - RouteMatch       -> path and method match
   * - MethodNotAllowed -> path matches, method does not (405)
   *
   * Case-sensitive; a trailing slash is significant in both directions.
   */
  match(host: string, canonical: CanonicalPath, method: string): MatchOutcome {
    const wanted = method.toUpperCase();
    const allowedMethods: string[] = [];

    for (const route of this.routes) {
      if (route.host !== null && route.host !== host) continue;
      if (route.segments.length !== canonical.segments.length) continue;
      if (route.hasTrailingSlash !== canonical.hasTrailingSlash) continue;

      const params = new Map<string, string>();
      let pathMatches = true;
      for (let i = 0; i < route.segments.length; i += 1) {
        const seg = route.segments[i];
        const actual = canonical.segments[i];
        if (seg === undefined || actual === undefined) return null;
        if ("literal" in seg) {
          if (seg.literal !== actual) {
            pathMatches = false;
            break;
          }
        } else {
          params.set(seg.param, actual);
        }
      }
      if (!pathMatches) continue;

      if (route.methods.includes(wanted)) {
        return { rule: route.rule, params };
      }
      allowedMethods.push(...route.methods);
    }

    return allowedMethods.length > 0
      ? { kind: "method-not-allowed", allowedMethods: [...new Set(allowedMethods)] }
      : null;
  }
}
