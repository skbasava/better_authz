import type { CompactSchema } from "@gateway/shared";

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

const TYPE_CHECKS: Record<string, (v: unknown) => boolean> = {
  object: (v) => typeof v === "object" && v !== null && !Array.isArray(v),
  array: Array.isArray,
  string: (v) => typeof v === "string",
  number: (v) => typeof v === "number" && Number.isFinite(v),
  integer: (v) => typeof v === "number" && Number.isInteger(v),
  boolean: (v) => typeof v === "boolean",
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  null: (v) => v === null,
};

function typeName(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

/** Validate a JSON value against the compact schema subset. Never throws. */
export function validateJson(schema: CompactSchema, value: unknown, path = "$"): ValidationResult {
  const errors: string[] = [];

  if (schema.enum !== undefined && !schema.enum.some((e) => e === value)) {
    errors.push(`${path}: value not in enum`);
    return { valid: false, errors };
  }

  if (schema.type !== undefined) {
    const check = TYPE_CHECKS[schema.type];
    if (check === undefined || !check(value)) {
      errors.push(`${path}: expected ${schema.type}, got ${typeName(value)}`);
      return { valid: false, errors };
    }
  }

  if (schema.type === "object" || (schema.type === undefined && schema.properties !== undefined)) {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      for (const req of schema.required ?? []) {
        if (!(req in obj)) errors.push(`${path}.${req}: required property missing`);
      }
      for (const [key, propSchema] of Object.entries(schema.properties ?? {})) {
        if (key in obj) {
          const r = validateJson(propSchema as CompactSchema, obj[key], `${path}.${key}`);
          errors.push(...r.errors);
        }
      }
      if (schema.additionalProperties === false && schema.properties !== undefined) {
        for (const key of Object.keys(obj)) {
          if (!(key in schema.properties)) errors.push(`${path}.${key}: additional property`);
        }
      }
    }
  }

  if (schema.type === "array" && Array.isArray(value) && schema.items !== undefined) {
    value.forEach((item, i) => {
      const r = validateJson(schema.items as CompactSchema, item, `${path}[${i}]`);
      errors.push(...r.errors);
    });
  }

  return { valid: errors.length === 0, errors };
}

const DEFAULT_MAX_BYTES = 1_048_576;

/**
 * Read (bounded), parse, and validate a JSON request body. Returns a REBUILT
 * Request whose body is the buffered bytes — the original stream is consumed
 * — so callers forward the returned request. Throws ValidationBodyTooLarge;
 * callers map it to 413. Empty/absent bodies validate as {} only when the
 * schema has no required fields.
 */
export class ValidationBodyTooLarge extends Error {
  constructor(readonly limit: number) {
    super(`Request body exceeds validation buffer limit (${limit} bytes)`);
    this.name = "ValidationBodyTooLarge";
  }
}

export async function readAndValidateBody(
  request: Request,
  schema: CompactSchema,
  maxBytes: number = DEFAULT_MAX_BYTES,
): Promise<{ readonly request: Request; readonly result: ValidationResult; readonly empty: boolean }> {
  if (request.body === null) {
    return { request, result: { valid: true, errors: [] }, empty: true };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ValidationBodyTooLarge(maxBytes);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }

  let parsed: unknown = undefined;
  let parseError: string | null = null;
  if (total > 0) {
    try {
      parsed = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      parseError = "$: body is not valid JSON";
    }
  }

  const result: ValidationResult =
    parseError !== null
      ? { valid: false, errors: [parseError] }
      : total === 0
        ? { valid: true, errors: [] }
        : validateJson(schema, parsed);

  const headers = new Headers(request.headers);
  headers.set("Content-Length", String(total));
  const rebuilt = new Request(request.url, { method: request.method, headers, body: bytes });
  return { request: rebuilt, result, empty: total === 0 };
}
