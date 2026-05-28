import { describe, expect, it } from "vitest";

import { getRateLimitPolicy } from "./policies";

describe("rate limit policies", () => {
  it("allows normal multi-file Portal upload sessions without tripping too early", () => {
    const policy = getRateLimitPolicy("portal_upload");

    expect(policy.windowSeconds).toBe(600);
    expect(policy.limit).toBeGreaterThanOrEqual(100);
  });
});
