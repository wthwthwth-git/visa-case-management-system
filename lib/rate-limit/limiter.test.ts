import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  requireAdminRateLimit,
  requirePortalPostValidationRateLimit,
  resetRateLimitAdapterForTests,
  setRateLimitAdapterForTests,
} from "./limiter";
import type { RateLimitAdapter } from "./types";

const mocks = vi.hoisted(() => ({
  writeAdminAuthAudit: vi.fn(),
}));

vi.mock("@/lib/auth/audit", () => ({
  writeAdminAuthAudit: mocks.writeAdminAuthAudit,
}));

function createBlockedAdapter(): RateLimitAdapter {
  return {
    increment: vi.fn().mockResolvedValue({
      count: 101,
      limit: 100,
      windowSeconds: 600,
      resetAt: new Date(Date.now() + 600_000),
      retryAfterSeconds: 60,
      allowed: false,
    }),
  };
}

describe("rate limit guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitAdapterForTests();
  });

  it("allows requests under the configured limit", async () => {
    const request = new Request("http://localhost/api/admin/cases/case-id/token/create", {
      method: "POST",
    });

    await expect(
      requireAdminRateLimit(request, {
        adminId: "admin-id",
        email: "admin@example.com",
        routeGroup: "admin_token_mutation",
      }),
    ).resolves.toMatchObject({
      allowed: true,
    });
  });

  it("throws RateLimitExceededError and writes safe audit metadata when blocked", async () => {
    const request = new Request("http://localhost/api/admin/cases/case-id/token/create", {
      method: "POST",
    });
    setRateLimitAdapterForTests(createBlockedAdapter());

    await expect(
      requireAdminRateLimit(request, {
        adminId: "admin-id",
        email: "admin@example.com",
        routeGroup: "admin_token_mutation",
      }),
    ).rejects.toMatchObject({
      name: "RateLimitExceededError",
      retryAfterSeconds: 60,
    });

    expect(mocks.writeAdminAuthAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "rate_limit_triggered",
        result: "blocked",
        adminUserId: "admin-id",
        email: "admin@example.com",
        metadata: {
          routeGroup: "admin_token_mutation",
          method: "POST",
          path: "/api/admin/cases/case-id/token/create",
          keyType: "admin",
          limit: 100,
          windowSeconds: 600,
          retryAfterSeconds: 60,
          reason: "rate_limit_exceeded",
        },
      }),
    );
    expect(JSON.stringify(mocks.writeAdminAuthAudit.mock.calls)).not.toContain("tokenHash");
    expect(JSON.stringify(mocks.writeAdminAuthAudit.mock.calls)).not.toContain("signedUrl");
    expect(JSON.stringify(mocks.writeAdminAuthAudit.mock.calls)).not.toContain("storagePath");
  });

  it("does not leak plaintext portal tokens or tokenHash in portal audit metadata", async () => {
    const request = new Request("http://localhost/api/portal/plaintext-token/case", {
      method: "GET",
    });
    setRateLimitAdapterForTests(createBlockedAdapter());

    await expect(
      requirePortalPostValidationRateLimit(request, {
        routeGroup: "portal_case",
        tokenId: "token-id",
        caseId: "case-id",
      }),
    ).rejects.toMatchObject({
      name: "RateLimitExceededError",
    });

    const serialized = JSON.stringify(mocks.writeAdminAuthAudit.mock.calls);

    expect(serialized).toContain("portal_case");
    expect(serialized).not.toContain("plaintext-token");
    expect(serialized).not.toContain("tokenHash");
  });

  it("does not fail the rate limit response when audit fails", async () => {
    const request = new Request("http://localhost/api/admin/cases/case-id/token/create", {
      method: "POST",
    });
    setRateLimitAdapterForTests(createBlockedAdapter());
    mocks.writeAdminAuthAudit.mockRejectedValue(new Error("database unavailable"));

    await expect(
      requireAdminRateLimit(request, {
        adminId: "admin-id",
        routeGroup: "admin_token_mutation",
      }),
    ).rejects.toMatchObject({
      name: "RateLimitExceededError",
    });
  });
});
