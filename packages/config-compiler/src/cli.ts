#!/usr/bin/env node
/**
 * gateway-config CLI — Phases 0/2/3.
 *   lint   <openapi...>                          route-auth lint gate (CI)
 *   build  <openapi> <origins.json>              emit GATEWAY_CONFIG JSON
 *   apply  <openapi> <origins.json> <wrangler>   write GATEWAY_CONFIG into wrangler.jsonc
 *   spec   <openapi>                             emit cleaned OpenAPI (x-gateway-* stripped)
 * Deploy remains a reviewed `wrangler deploy` step (config is a security surface).
 */
import { readFileSync, writeFileSync } from "node:fs";

import { compileOpenapi, stripExtensions } from "./openapi.js";
import { lintOpenapi } from "./lint.js";

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

/** Strict argv access: missing args are a usage error, not an undefined. */
function arg(args: readonly string[], i: number, name: string): string {
  const v = args[i];
  if (v === undefined) {
    console.error(`missing argument: ${name}`);
    process.exit(2);
  }
  return v;
}

/** Pure: replace the GATEWAY_CONFIG var inside wrangler.jsonc text. */
export function applyGatewayConfig(wranglerText: string, configJson: string): string {
  const escaped = JSON.stringify(configJson); // JSON string literal for the var value
  const re = /("GATEWAY_CONFIG"\s*:\s*)"[^"]*"/;
  if (!re.test(wranglerText)) {
    throw new Error("GATEWAY_CONFIG var not found in wrangler.jsonc");
  }
  return wranglerText.replace(re, `$1${escaped}`);
}

const [, , command, ...args] = process.argv;

if (command === "lint") {
  let failed = false;
  for (const file of args) {
    const findings = lintOpenapi(readJson(file));
    for (const f of findings) console.error(`FAIL ${file} — ${f.where}: ${f.message}`);
    if (findings.length > 0) failed = true;
  }
  if (failed) process.exit(1);
  console.log("lint: OK");
} else if (command === "build") {
  const openapiPath = arg(args, 0, "<openapi>");
  const originsPath = arg(args, 1, "<origins.json>");
  const project = readJson(originsPath) as { origins: never; tenantHosts?: never };
  const result = compileOpenapi({
    openapi: readJson(openapiPath),
    origins: project.origins,
    ...(project.tenantHosts === undefined ? {} : { tenantHosts: project.tenantHosts }),
  });
  for (const w of result.warnings) console.error(`WARN ${w}`);
  console.log(JSON.stringify(result.config));
} else if (command === "apply") {
  const openapiPath = arg(args, 0, "<openapi>");
  const originsPath = arg(args, 1, "<origins.json>");
  const wranglerPath = arg(args, 2, "<wrangler.jsonc>");
  const project = readJson(originsPath) as { origins: never; tenantHosts?: never };
  const result = compileOpenapi({
    openapi: readJson(openapiPath),
    origins: project.origins,
    ...(project.tenantHosts === undefined ? {} : { tenantHosts: project.tenantHosts }),
  });
  for (const w of result.warnings) console.error(`WARN ${w}`);
  const text = readFileSync(wranglerPath, "utf8");
  const next = applyGatewayConfig(text, JSON.stringify(result.config));
  writeFileSync(wranglerPath, next);
  console.log(`applied GATEWAY_CONFIG (${result.config.routes.length} routes) to ${wranglerPath}`);
  console.log("next: wrangler deploy (reviewed step)");
} else if (command === "spec") {
  const openapiPath = arg(args, 0, "<openapi>");
  console.log(JSON.stringify(stripExtensions(readJson(openapiPath)), null, 2));
} else {
  console.error("usage: gateway-config lint|build|apply|spec ...");
  process.exit(2);
}
