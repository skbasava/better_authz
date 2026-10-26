import { describe, expect, it } from "vitest";

import { compileOpenapi, toCompactSchema } from "../src/openapi.js";
import { lintOpenapi } from "../src/lint.js";

const origins = [
  { id: "erp", url: "https://api.example.com", secretEnvVar: "ORIGIN_ERP_SECRET", deadlineMs: 5000 },
] as const;

const openApi = {
  openapi: "3.1.0",
  paths: {
    "/orgs/{organizationId}/invoices": {
      post: {
        operationId: "create-invoice",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["number", "amount"],
                additionalProperties: false,
                properties: {
                  number: { type: "string" },
                  amount: { type: "integer" },
                  status: { type: "string", enum: ["draft", "issued"] },
                },
              },
            },
          },
        },
        "x-gateway-route": {
          origin: "erp",
          destinationPath: "/v1/orgs/{organizationId}/invoices",
          policy: { kind: "organization-permission", organizationIdFrom: "path.organizationId", allOf: ["invoice.create"] },
          requestValidation: "reject",
          maxBodyBytes: 65536,
        },
      },
    },
  },
};

describe("compileOpenapi", () => {
  it("translates OpenAPI routes into RouteRule with :params", () => {
    const { config, warnings } = compileOpenapi({ openapi: openApi, origins: [...origins] });
    expect(warnings).toEqual([]);
    expect(config.routes).toHaveLength(1);
    const rule = config.routes[0];
    expect(rule?.path).toBe("/orgs/:organizationId/invoices");
    expect(rule?.destinationPath).toBe("/v1/orgs/:organizationId/invoices");
    expect(rule?.policy).toMatchObject({ kind: "organization-permission" });
    expect(rule?.maxBodyBytes).toBe(65536);
  });

  it("extracts requestBody schema into requestValidation", () => {
    const { config } = compileOpenapi({ openapi: openApi, origins: [...origins] });
    const rv = config.routes[0]?.requestValidation;
    expect(rv?.mode).toBe("reject");
    expect(rv?.schema.required).toEqual(["number", "amount"]);
    expect(rv?.schema.additionalProperties).toBe(false);
  });

  it("resolves $refs into components", () => {
    const doc = {
      components: { schemas: { Money: { type: "integer" } } },
      paths: {},
    };
    const cs = toCompactSchema(doc, { $ref: "#/components/schemas/Money" });
    expect(cs).toEqual({ type: "integer" });
  });
});

describe("lintOpenapi", () => {
  it("fails operations without x-gateway-route", () => {
    const findings = lintOpenapi({ paths: { "/a": { get: { operationId: "op-a" } } } });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toMatch(/missing x-gateway-route/);
  });

  it("fails public routes without an allowlisted reason", () => {
    const findings = lintOpenapi({
      paths: {
        "/a": {
          get: {
            operationId: "op-a",
            "x-gateway-route": { origin: "erp", destinationPath: "/a", policy: { kind: "public" } },
          },
        },
      },
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toMatch(/x-gateway-public/);
  });

  it("passes annotated public routes and policy-bearing routes", () => {
    const findings = lintOpenapi({
      paths: {
        "/health": {
          get: {
            operationId: "health",
            "x-gateway-route": { origin: "erp", destinationPath: "/health", policy: { kind: "public" } },
            "x-gateway-public": { reason: "liveness probe, no data" },
          },
        },
        "/x": {
          get: {
            operationId: "x",
            "x-gateway-route": { origin: "erp", destinationPath: "/x", policy: { kind: "signed-in" } },
          },
        },
      },
    });
    expect(findings).toEqual([]);
  });
});

describe("cross-app permission prefix lint", () => {
  const routeFor = (audience: string, allOf: string[]) => ({
    paths: {
      "/x": {
        get: {
          operationId: "x",
          "x-gateway-route": {
            origin: "erp",
            destinationPath: "/x",
            audience,
            policy: { kind: "organization-permission", organizationIdFrom: "path.orgId", allOf },
          },
        },
      },
    },
  });

  it("passes correctly prefixed permissions", () => {
    expect(lintOpenapi(routeFor("erp", ["erp.invoice.read"]))).toEqual([]);
  });

  it("fails foreign-app permissions on a shared gateway", () => {
    const findings = lintOpenapi(routeFor("erp", ["hos.patient.read"]));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toMatch(/not prefixed with route audience/);
  });
});
