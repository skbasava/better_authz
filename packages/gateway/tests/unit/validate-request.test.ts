import { describe, expect, it } from "vitest";

import { validateJson } from "../../src/policies/validate-request.js";

describe("validateJson (compact schema)", () => {
  const invoiceSchema = {
    type: "object" as const,
    required: ["number", "amount"],
    additionalProperties: false,
    properties: {
      number: { type: "string" as const },
      amount: { type: "integer" as const },
      status: { type: "string" as const, enum: ["draft", "issued"] },
      lines: { type: "array" as const, items: { type: "string" as const } },
    },
  };

  it("accepts a conforming body", () => {
    const r = validateJson(invoiceSchema, { number: "INV-1", amount: 100, status: "draft", lines: ["a"] });
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("rejects missing required fields with paths", () => {
    const r = validateJson(invoiceSchema, { number: "INV-1" });
    expect(r.valid).toBe(false);
    expect(r.errors.join()).toMatch(/\$\.amount: required property missing/);
  });

  it("rejects type mismatches and bad enum values", () => {
    expect(validateJson(invoiceSchema, { number: "N", amount: "100" }).errors.join()).toMatch(/expected integer/);
    expect(validateJson(invoiceSchema, { number: "N", amount: 1, status: "void" }).errors.join()).toMatch(/not in enum/);
  });

  it("rejects additional properties when disallowed", () => {
    const r = validateJson(invoiceSchema, { number: "N", amount: 1, evil: true });
    expect(r.errors.join()).toMatch(/\$\.evil: additional property/);
  });

  it("validates nested arrays with indexed paths", () => {
    const r = validateJson(invoiceSchema, { number: "N", amount: 1, lines: ["ok", 42] });
    expect(r.errors.join()).toMatch(/\$\.lines\[1\]: expected string/);
  });

  it("never throws on hostile input", () => {
    expect(validateJson({ type: "object" }, null).valid).toBe(false);
    expect(validateJson({ type: "array" }, {}).valid).toBe(false);
    expect(validateJson({}, "anything").valid).toBe(true);
  });
});
