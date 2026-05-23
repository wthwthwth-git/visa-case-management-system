import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requestPortalApplicationConfirmationRevision: vi.fn(),
  validatePortalToken: vi.fn(),
  requirePortalPreValidationRateLimit: vi.fn(),
  requirePortalPostValidationRateLimit: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  portalServices: {
    requestPortalApplicationConfirmationRevision:
      mocks.requestPortalApplicationConfirmationRevision,
    validatePortalToken: mocks.validatePortalToken,
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  requirePortalPreValidationRateLimit: mocks.requirePortalPreValidationRateLimit,
  requirePortalPostValidationRateLimit: mocks.requirePortalPostValidationRateLimit,
}));

import { POST } from "./route";

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
  "comment",
];

function createRequest(body: Record<string, unknown>) {
  return new Request(
    "http://localhost/api/portal/token/application-confirmations/confirmation-id/request-revision",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

describe("POST /api/portal/[token]/application-confirmations/[confirmationId]/request-revision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validatePortalToken.mockResolvedValue({
      tokenId: "token-id",
      caseId: "case-id",
    });
    mocks.requirePortalPreValidationRateLimit.mockResolvedValue(undefined);
    mocks.requirePortalPostValidationRateLimit.mockResolvedValue(undefined);
    mocks.requestPortalApplicationConfirmationRevision.mockResolvedValue({
      id: "confirmation-id",
      title: "Application",
      version: 1,
      status: "needs_revision",
      confirmedAt: null,
      createdAt: "2025-12-01T00:00:00.000Z",
    });
  });

  it("ignores body.caseId and calls portalServices with token, confirmationId, comment, and reason only", async () => {
    const response = await POST(
      createRequest({
        caseId: "attacker-case",
        status: "confirmed",
        internalNote: "do not trust",
        storagePath: "cases/attacker/application.pdf",
        comment: "Please revise this.",
        reason: "client requested revision",
      }),
      {
        params: Promise.resolve({
          token: "portal-token",
          confirmationId: "confirmation-id",
        }),
      },
    );
    const payload = await response.json();

    expect(mocks.requirePortalPreValidationRateLimit).toHaveBeenCalledWith(
      expect.any(Request),
      "portal_confirmation",
    );
    expect(mocks.validatePortalToken).toHaveBeenCalledWith("portal-token");
    expect(mocks.requirePortalPostValidationRateLimit).toHaveBeenCalledWith(expect.any(Request), {
      routeGroup: "portal_confirmation",
      tokenId: "token-id",
      caseId: "case-id",
    });
    expect(mocks.requestPortalApplicationConfirmationRevision).toHaveBeenCalledWith({
      token: "portal-token",
      confirmationId: "confirmation-id",
      comment: "Please revise this.",
      reason: "client requested revision",
    });
    expect(payload.data.status).toBe("needs_revision");
  });

  it("does not include comment, forbidden fields, or signedUrl in the response", async () => {
    const response = await POST(
      createRequest({
        comment: "Please revise this.",
        reason: "client requested revision",
      }),
      {
        params: Promise.resolve({
          token: "portal-token",
          confirmationId: "confirmation-id",
        }),
      },
    );
    const payload = JSON.stringify(await response.json());

    for (const field of forbiddenFields) {
      expect(payload).not.toContain(field);
    }

    expect(payload).not.toContain("Please revise this.");
  });

  it("maps invalid input errors to INVALID_REQUEST", async () => {
    const error = new Error("token and storagePath must not leak");
    error.name = "InvalidPortalApplicationConfirmationInputError";
    mocks.requestPortalApplicationConfirmationRevision.mockRejectedValue(error);

    const response = await POST(createRequest({ comment: "contains signedUrl" }), {
      params: Promise.resolve({
        token: "portal-token",
        confirmationId: "confirmation-id",
      }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "Invalid request.",
      },
    });
    expect(JSON.stringify(payload)).not.toContain("storagePath");
    expect(JSON.stringify(payload)).not.toContain("token");
  });

  it("maps rate limit errors safely and does not call service", async () => {
    const error = new Error("rate limited");
    error.name = "RateLimitExceededError";
    Object.assign(error, { retryAfterSeconds: 10 });
    mocks.requirePortalPreValidationRateLimit.mockRejectedValue(error);

    const response = await POST(createRequest({}), {
      params: Promise.resolve({
        token: "portal-token",
        confirmationId: "confirmation-id",
      }),
    });
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("10");
    expect(payload.error.code).toBe("RATE_LIMITED");
    expect(mocks.requestPortalApplicationConfirmationRevision).not.toHaveBeenCalled();
  });

  it("does not import prisma or admin services", () => {
    const source = readFileSync(resolve(__dirname, "route.ts"), "utf8");

    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("adminServices");
  });
});
