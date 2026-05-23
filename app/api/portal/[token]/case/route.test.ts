import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPortalCaseByToken: vi.fn(),
  validatePortalToken: vi.fn(),
  requirePortalPreValidationRateLimit: vi.fn(),
  requirePortalPostValidationRateLimit: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  portalServices: {
    getPortalCaseByToken: mocks.getPortalCaseByToken,
    validatePortalToken: mocks.validatePortalToken,
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  requirePortalPreValidationRateLimit: mocks.requirePortalPreValidationRateLimit,
  requirePortalPostValidationRateLimit: mocks.requirePortalPostValidationRateLimit,
}));

import { GET } from "./route";

const forbiddenFields = [
  "internalNote",
  "storagePath",
  "storageBucket",
  "tokenHash",
  "originalFileName",
  "metadata",
  "actorId",
  "actorType",
  "signedUrl",
];

describe("GET /api/portal/[token]/case", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validatePortalToken.mockResolvedValue({
      tokenId: "token-id",
      caseId: "case-id",
    });
    mocks.requirePortalPreValidationRateLimit.mockResolvedValue(undefined);
    mocks.requirePortalPostValidationRateLimit.mockResolvedValue(undefined);
    mocks.getPortalCaseByToken.mockResolvedValue({
      caseId: "case-id",
      caseNumber: "CASE-001",
      customerName: "Seed Customer",
      targetVisaType: "Engineer",
      casePhase: "collecting_documents",
      requirements: [],
      applicationConfirmations: [],
    });
  });

  it("calls portalServices with only the token and returns a data response", async () => {
    const response = await GET(new Request("http://localhost/api/portal/token/case"), {
      params: Promise.resolve({ token: "portal-token" }),
    });
    const payload = await response.json();

    expect(mocks.getPortalCaseByToken).toHaveBeenCalledWith("portal-token");
    expect(mocks.requirePortalPreValidationRateLimit).toHaveBeenCalledWith(
      expect.any(Request),
      "portal_case",
    );
    expect(mocks.validatePortalToken).toHaveBeenCalledWith("portal-token");
    expect(mocks.requirePortalPostValidationRateLimit).toHaveBeenCalledWith(expect.any(Request), {
      routeGroup: "portal_case",
      tokenId: "token-id",
      caseId: "case-id",
    });
    expect(payload.data.caseId).toBe("case-id");
    expect(response.status).toBe(200);
  });

  it("does not call the portal service when pre-validation rate limit fails", async () => {
    const error = new Error("raw key must not leak");
    error.name = "RateLimitExceededError";
    Object.assign(error, { retryAfterSeconds: 15 });
    mocks.requirePortalPreValidationRateLimit.mockRejectedValue(error);

    const response = await GET(new Request("http://localhost/api/portal/token/case"), {
      params: Promise.resolve({ token: "portal-token" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("15");
    expect(payload.error.code).toBe("RATE_LIMITED");
    expect(mocks.validatePortalToken).not.toHaveBeenCalled();
    expect(mocks.getPortalCaseByToken).not.toHaveBeenCalled();
  });

  it("does not include forbidden fields in normal Portal responses", async () => {
    const response = await GET(new Request("http://localhost/api/portal/token/case"), {
      params: Promise.resolve({ token: "portal-token" }),
    });
    const payload = JSON.stringify(await response.json());

    for (const field of forbiddenFields) {
      expect(payload).not.toContain(field);
    }
  });

  it("maps token errors to safe error responses", async () => {
    const error = new Error("tokenHash and case details must not leak");
    error.name = "InvalidPortalTokenError";
    mocks.getPortalCaseByToken.mockRejectedValue(error);

    const response = await GET(new Request("http://localhost/api/portal/token/case"), {
      params: Promise.resolve({ token: "bad-token" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({
      error: {
        code: "INVALID_PORTAL_TOKEN",
        message: "Invalid or expired link.",
      },
    });
    expect(JSON.stringify(payload)).not.toContain("tokenHash");
  });

  it("does not import prisma or admin services", () => {
    const source = readFileSync(resolve(__dirname, "route.ts"), "utf8");

    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("adminServices");
  });
});
