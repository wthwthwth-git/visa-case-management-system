import { describe, expect, it, vi, beforeEach } from "vitest";
import { DELETE } from "./route";

const mocks = vi.hoisted(() => ({
  deletePortalUploadedFile: vi.fn(),
  validatePortalToken: vi.fn(),
  requirePortalPreValidationRateLimit: vi.fn(),
  requirePortalUploadRateLimit: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  portalServices: {
    deletePortalUploadedFile: mocks.deletePortalUploadedFile,
    validatePortalToken: mocks.validatePortalToken,
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  requirePortalPreValidationRateLimit: mocks.requirePortalPreValidationRateLimit,
  requirePortalUploadRateLimit: mocks.requirePortalUploadRateLimit,
}));

describe("DELETE /api/portal/[token]/requirements/[requirementId]/files/[fileId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validatePortalToken.mockResolvedValue({
      tokenId: "token-id",
      caseId: "case-id",
    });
    mocks.requirePortalPreValidationRateLimit.mockResolvedValue(undefined);
    mocks.requirePortalUploadRateLimit.mockResolvedValue(undefined);
    mocks.deletePortalUploadedFile.mockResolvedValue({
      fileId: "file-id",
      requirementId: "requirement-id",
      status: "removed",
    });
  });

  it("validates token, applies upload rate limit, and deletes through portal service", async () => {
    const response = await DELETE(new Request("http://test.local"), {
      params: Promise.resolve({
        token: "plain-token",
        requirementId: "requirement-id",
        fileId: "file-id",
      }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      data: {
        fileId: "file-id",
        requirementId: "requirement-id",
        status: "removed",
      },
    });
    expect(mocks.requirePortalPreValidationRateLimit).toHaveBeenCalledWith(
      expect.any(Request),
      "portal_upload",
    );
    expect(mocks.validatePortalToken).toHaveBeenCalledWith("plain-token");
    expect(mocks.requirePortalUploadRateLimit).toHaveBeenCalledWith(expect.any(Request), {
      tokenId: "token-id",
      requirementId: "requirement-id",
    });
    expect(mocks.deletePortalUploadedFile).toHaveBeenCalledWith({
      token: "plain-token",
      requirementId: "requirement-id",
      fileId: "file-id",
    });
  });

  it("does not call service when rate limited", async () => {
    const error = new Error("limited");
    error.name = "RateLimitExceededError";
    mocks.requirePortalUploadRateLimit.mockRejectedValue(error);

    const response = await DELETE(new Request("http://test.local"), {
      params: Promise.resolve({
        token: "plain-token",
        requirementId: "requirement-id",
        fileId: "file-id",
      }),
    });
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload.error.code).toBe("RATE_LIMITED");
    expect(mocks.deletePortalUploadedFile).not.toHaveBeenCalled();
  });

  it("maps delete access errors safely", async () => {
    const error = new Error("storagePath tokenHash");
    error.name = "PortalFileDeleteAccessError";
    mocks.deletePortalUploadedFile.mockRejectedValue(error);

    const response = await DELETE(new Request("http://test.local"), {
      params: Promise.resolve({
        token: "plain-token",
        requirementId: "requirement-id",
        fileId: "file-id",
      }),
    });
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe("FILE_NOT_ACCESSIBLE");
    expect(JSON.stringify(payload)).not.toContain("storagePath");
    expect(JSON.stringify(payload)).not.toContain("tokenHash");
  });
});
