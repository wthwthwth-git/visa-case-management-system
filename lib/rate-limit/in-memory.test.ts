import { describe, expect, it, vi } from "vitest";
import { InMemoryRateLimitAdapter } from "./in-memory";

describe("InMemoryRateLimitAdapter", () => {
  it("allows requests under the limit", async () => {
    const adapter = new InMemoryRateLimitAdapter();

    const first = await adapter.increment({
      key: "test-key",
      limit: 2,
      windowSeconds: 60,
    });
    const second = await adapter.increment({
      key: "test-key",
      limit: 2,
      windowSeconds: 60,
    });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(second.count).toBe(2);
    expect(second.retryAfterSeconds).toBeNull();
  });

  it("blocks over the limit and returns retryAfterSeconds", async () => {
    const adapter = new InMemoryRateLimitAdapter();

    await adapter.increment({ key: "test-key", limit: 1, windowSeconds: 60 });
    const blocked = await adapter.increment({ key: "test-key", limit: 1, windowSeconds: 60 });

    expect(blocked.allowed).toBe(false);
    expect(blocked.count).toBe(2);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets after the window", async () => {
    vi.useFakeTimers();
    const adapter = new InMemoryRateLimitAdapter();

    await adapter.increment({ key: "test-key", limit: 1, windowSeconds: 1 });
    await adapter.increment({ key: "test-key", limit: 1, windowSeconds: 1 });

    vi.advanceTimersByTime(1001);

    const allowed = await adapter.increment({ key: "test-key", limit: 1, windowSeconds: 1 });

    expect(allowed.allowed).toBe(true);
    expect(allowed.count).toBe(1);

    vi.useRealTimers();
  });
});
