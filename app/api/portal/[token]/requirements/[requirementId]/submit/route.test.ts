import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  submitPortalDocumentRequirement: vi.fn(),
  validatePortalToken: vi.fn(),
  requirePortalPreValidationRateLimit: vi.fn(),
  requirePortalUploadRateLimit: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  portalServices: {
    submitPortalDocumentRequirement: mocks.submitPortalDocumentRequirement,
    validatePortalToken: mocks.validatePortalToken,
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  requirePortalPreValidationRateLimit: mocks.requirePortalPreValidationRateLimit,
  requirePortalUploadRateLimit: mocks.requirePortalUploadRateLimit,
}));

import { POST } from "./route";

describe("POST /api/portal/[token]/requirements/[requirementId]/submit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validatePortalToken.mockResolvedValue({
      tokenId: "token-id",
      caseId: "case-id",
    });
    mocks.requirePortalPreValidationRateLimit.mockResolvedValue(undefined);
    mocks.requirePortalUploadRateLimit.mockResolvedValue(undefined);
    mocks.submitPortalDocumentRequirement.mockResolvedValue({
      requirementId: "requirement-id",
      clientStatus: "submitted",
      submittedFileCount: 2,
    });
  });

  it("validates token, applies upload rate limit, and submits through portal service", async () => {
    const response = await POST(
      new Request("http://localhost/api/portal/token/requirements/requirement-id/submit", {
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

    expect(mocks.requirePortalPreValidationRateLimit).toHaveBeenCalledWith(
      expect.any(Request),
      "portal_upload",
    );
    expect(mocks.validatePortalToken).toHaveBeenCalledWith("portal-token");
    expect(mocks.requirePortalUploadRateLimit).toHaveBeenCalledWith(expect.any(Request), {
      tokenId: "token-id",
      requirementId: "requirement-id",
    });
    expect(mocks.submitPortalDocumentRequirement).toHaveBeenCalledWith({
      token: "portal-token",
      requirementId: "requirement-id",
    });
    expect(payload.data).toEqual({
      requirementId: "requirement-id",
      clientStatus: "submitted",
      submittedFileCount: 2,
    });
  });

  it("does not call submit service when rate limited", async () => {
    const error = new Error("raw limiter key must not leak");
    error.name = "RateLimitExceededError";
    Object.assign(error, { retryAfterSeconds: 10 });
    mocks.requirePortalUploadRateLimit.mockRejectedValue(error);

    const response = await POST(
      new Request("http://localhost/api/portal/token/requirements/requirement-id/submit", {
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
    expect(mocks.submitPortalDocumentRequirement).not.toHaveBeenCalled();
  });

  it("maps submit access errors to safe INVALID_REQUEST responses", async () => {
    const error = new Error("storagePath tokenHash should not leak");
    error.name = "PortalRequirementSubmitAccessError";
    mocks.submitPortalDocumentRequirement.mockRejectedValue(error);

    const response = await POST(
      new Request("http://localhost/api/portal/token/requirements/requirement-id/submit", {
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
