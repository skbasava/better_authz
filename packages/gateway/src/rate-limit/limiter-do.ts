/**
 * Fixed-window rate limiter Durable Object.
 *
 * NOTE: the spec calls this a "token bucket" but defines a fixed-window
 * counter with reset. This implements the specified algorithm exactly; a
 * change to a continuously refilling bucket requires spec review.
 *
 * Request body:  { limit: number; windowMs: number }
 * Response body: { allowed: boolean; retryAfterMs: number }
 */

export interface BucketStore {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
}

/**
 * Minimal structural requirement — the real DurableObjectState satisfies
 * it, and tests can implement it directly without any casts.
 */
export interface LimiterState {
  readonly storage: BucketStore;
  blockConcurrencyWhile(callback: () => Promise<void>): unknown;
}

interface Bucket {
  readonly tokens: number;
  readonly windowStart: number;
}

export class RateLimiterDO {
  private bucket: Bucket | null = null;
  private readonly storage: BucketStore;

  constructor(state: LimiterState, _env: unknown) {
    this.storage = state.storage;
    // Load once into memory; blockConcurrencyWhile serializes startup so no
    // request observes a half-loaded bucket.
    void state.blockConcurrencyWhile(async () => {
      this.bucket = ((await this.storage.get("bucket")) ?? null) as Bucket | null;
    });
  }

  async fetch(request: Request): Promise<Response> {
    let parsed: unknown;
    try {
      parsed = await request.json();
    } catch {
      return Response.json({ error: "invalid body" }, { status: 400 });
    }
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as { limit?: unknown }).limit !== "number" ||
      typeof (parsed as { windowMs?: unknown }).windowMs !== "number"
    ) {
      return Response.json({ error: "invalid body" }, { status: 400 });
    }
    const { limit, windowMs } = parsed as { limit: number; windowMs: number };
    if (!Number.isInteger(limit) || limit <= 0 || !Number.isInteger(windowMs) || windowMs <= 0) {
      return Response.json({ error: "invalid body" }, { status: 400 });
    }

    const now = Date.now();
    let bucket = this.bucket ?? null;
    if (bucket === null || now - bucket.windowStart >= windowMs) {
      bucket = { tokens: limit, windowStart: now };
    }

    if (bucket.tokens <= 0) {
      this.bucket = bucket;
      return Response.json({
        allowed: false,
        retryAfterMs: windowMs - (now - bucket.windowStart),
      });
    }

    const next: Bucket = { tokens: bucket.tokens - 1, windowStart: bucket.windowStart };
    this.bucket = next;
    await this.storage.put("bucket", next);
    return Response.json({ allowed: true, retryAfterMs: 0 });
  }
}
