import type { GatewayConfig, PermissionCatalog } from "@gateway/shared";

import { RouteRegistry } from "../routing/matcher.js";
import { validateRouteConfig, type GatewayConfigError } from "./loader.js";

export interface GatewayRegistry {
  readonly config: GatewayConfig;
  readonly routes: RouteRegistry;
}

/** Init-time validated registry. Throws GatewayConfigError on invalid config. */
export function buildRegistry(rawConfig: unknown, catalog: PermissionCatalog): GatewayRegistry {
  const config = validateRouteConfig(rawConfig, catalog);
  return { config, routes: new RouteRegistry(config.routes) };
}

export type { GatewayConfigError };
