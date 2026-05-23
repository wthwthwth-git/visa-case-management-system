import type { RateLimitAdapter, RateLimitHit, RateLimitIncrementInput } from "./types";

type InMemoryRateLimitEntry = {
  count: number;
  resetAtMs: number;
};

export class InMemoryRateLimitAdapter implements RateLimitAdapter {
  private readonly entries = new Map<string, InMemoryRateLimitEntry>();

  async increment(input: RateLimitIncrementInput): Promise<RateLimitHit> {
    const nowMs = Date.now();
    const windowMs = input.windowSeconds * 1000;
    const current = this.entries.get(input.key);

    if (!current || current.resetAtMs <= nowMs) {
      const resetAtMs = nowMs + windowMs;
      const count = 1;

      this.entries.set(input.key, {
        count,
        resetAtMs,
      });

      return {
        count,
        limit: input.limit,
        windowSeconds: input.windowSeconds,
        resetAt: new Date(resetAtMs),
        retryAfterSeconds: null,
        allowed: true,
      };
    }

    const count = current.count + 1;
    current.count = count;

    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAtMs - nowMs) / 1000));

    return {
      count,
      limit: input.limit,
      windowSeconds: input.windowSeconds,
      resetAt: new Date(current.resetAtMs),
      retryAfterSeconds: count > input.limit ? retryAfterSeconds : null,
      allowed: count <= input.limit,
    };
  }

  clear() {
    this.entries.clear();
  }
}

export const inMemoryRateLimitAdapter = new InMemoryRateLimitAdapter();
