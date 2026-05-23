import { describe, expect, it, vi } from "vitest";
import { UpstashRateLimitAdapter } from "./upstash";

function createRedisMock(result: unknown) {
  return {
    eval: vi.fn().mockResolvedValue(result),
  };
}

describe("UpstashRateLimitAdapter", () => {
  it("uses atomic eval to increment and apply ttl", async () => {
    const redis = createRedisMock([1, 60]);
    const adapter = new UpstashRateLimitAdapter(redis);

    const hit = await adapter.increment({
      key: "admin:admin-id:admin_token_mutation",
      limit: 2,
      windowSeconds: 60,
    });

    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("INCR"),
      ["rate-limit:admin:admin-id:admin_token_mutation"],
      ["60"],
    );
    expect(hit).toMatchObject({
      count: 1,
      limit: 2,
      windowSeconds: 60,
      allowed: true,
      retryAfterSeconds: null,
    });
  });

  it("blocks over the limit and returns retryAfterSeconds from ttl", async () => {
    const redis = createRedisMock([3, 42]);
    const adapter = new UpstashRateLimitAdapter(redis);

    const hit = await adapter.increment({
      key: "portal:token-id:case-id:portal_case",
      limit: 2,
      windowSeconds: 60,
    });

    expect(hit.allowed).toBe(false);
    expect(hit.count).toBe(3);
    expect(hit.retryAfterSeconds).toBe(42);
    expect(hit.resetAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("normalizes non-positive ttl to at least one second", async () => {
    const redis = createRedisMock([2, 0]);
    const adapter = new UpstashRateLimitAdapter(redis);

    const hit = await adapter.increment({
      key: "test-key",
      limit: 1,
      windowSeconds: 60,
    });

    expect(hit.retryAfterSeconds).toBe(60);
  });

  it("does not hide Redis client errors", async () => {
    const redis = {
      eval: vi.fn().mockRejectedValue(new Error("redis unavailable")),
    };
    const adapter = new UpstashRateLimitAdapter(redis);

    await expect(
      adapter.increment({
        key: "test-key",
        limit: 1,
        windowSeconds: 60,
      }),
    ).rejects.toThrow("redis unavailable");
  });

  it("rejects malformed Upstash responses", async () => {
    const redis = createRedisMock(["not-a-number", 60]);
    const adapter = new UpstashRateLimitAdapter(redis);

    await expect(
      adapter.increment({
        key: "test-key",
        limit: 1,
        windowSeconds: 60,
      }),
    ).rejects.toThrow("Invalid Upstash rate limit response.");
  });
});
