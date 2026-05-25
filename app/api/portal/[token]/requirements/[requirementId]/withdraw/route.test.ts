import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withdrawPortalDocumentRequirementSubmission: vi.fn(),
  validatePortalToken: vi.fn(),
  requirePortalPreValidationRateLimit: vi.fn(),
  requirePortalUploadRateLimit: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  portalServices: {
    withdrawPortalDocumentRequirementSubmission:
      mocks.withdrawPortalDocumentRequirementSubmission,
    validatePortalToken: mocks.validatePortalToken,
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  requirePortalPreValidationRateLimit: mocks.requirePortalPreValidationRateLimit,
  requirePortalUploadRateLimit: mocks.requirePortalUploadRateLimit,
}));

import { POST } from "./route";

describe("POST /api/portal/[token]/requirements/[requirementId]/withdraw", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validatePortalToken.mockResolvedValue({
      tokenId: "token-id",
      caseId: "case-id",
    });
    mocks.requirePortalPreValidationRateLimit.mockResolvedValue(undefined);
    mocks.requirePortalUploadRateLimit.mockResolvedValue(undefined);
    mocks.withdrawPortalDocumentRequirementSubmission.mockResolvedValue({
      requirementId: "requirement-id",
      clientStatus: "not_submitted",
      submittedFileCount: 2,
    });
  });

  it("validates token, applies upload rate limit, and withdraws through portal service", async () => {
    const response = await POST(
      new Request("http://localhost/api/portal/token/requirements/requirement-id/withdraw", {
        method: "POST",
        body: JSON.stringify({
          caseId: "ignored-case-id",
          status: "ignored",
          storagePath: "ignored",
          tokenHash: "ignored",
        }),
      }),
      {
        params: Promise.resolve({
          token: "portal-token",
          requirementId: "requirement-id",
        }),
      },
    );
    const payload = await response.json();

    expect(mocks.requirePortalPreValidationRateLimit).toHaveBeenCalledWith(
      expect.any(Request),
      "portal_upload",
    );
    expect(mocks.validatePortalToken).toHaveBeenCalledWith("portal-token");
    expect(mocks.requirePortalUploadRateLimit).toHaveBeenCalledWith(expect.any(Request), {
      tokenId: "token-id",
      requirementId: "requirement-id",
    });
    expect(mocks.withdrawPortalDocumentRequirementSubmission).toHaveBeenCalledWith({
      token: "portal-token",
      requirementId: "requirement-id",
    });
    expect(payload.data).toEqual({
      requirementId: "requirement-id",
      clientStatus: "not_submitted",
      submittedFileCount: 2,
    });
  });

  it("does not call withdraw service when rate limited", async () => {
    const error = new Error("raw limiter key must not leak");
    error.name = "RateLimitExceededError";
    Object.assign(error, { retryAfterSeconds: 10 });
    mocks.requirePortalUploadRateLimit.mockRejectedValue(error);

    const response = await POST(
      new Request("http://localhost/api/portal/token/requirements/requirement-id/withdraw", {
        method: "POST",
      }),
      {
        params: Promise.resolve({
          token: "portal-token",
          requirementId: "requirement-id",
        }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("10");
    expect(payload.error.code).toBe("RATE_LIMITED");
    expect(mocks.withdrawPortalDocumentRequirementSubmission).not.toHaveBeenCalled();
  });

  it("maps withdraw access errors to safe INVALID_REQUEST responses", async () => {
    const error = new Error("storagePath tokenHash should not leak");
    error.name = "PortalRequirementSubmitAccessError";
    mocks.withdrawPortalDocumentRequirementSubmission.mockRejectedValue(error);

    const response = await POST(
      new Request("http://localhost/api/portal/token/requirements/requirement-id/withdraw", {
        method: "POST",
      }),
      {
        params: Promise.resolve({
          token: "portal-token",
          requirementId: "requirement-id",
        }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
    expect(JSON.stringify(payload)).not.toContain("storagePath");
    expect(JSON.stringify(payload)).not.toContain("tokenHash");
  });

  it("does not import prisma or admin services", () => {
    const source = readFileSync(resolve(__dirname, "route.ts"), "utf8");

    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("adminServices");
  });
});
