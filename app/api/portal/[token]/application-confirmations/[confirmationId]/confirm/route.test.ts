import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  confirmPortalApplicationConfirmation: vi.fn(),
  validatePortalToken: vi.fn(),
  requirePortalPreValidationRateLimit: vi.fn(),
  requirePortalPostValidationRateLimit: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  portalServices: {
    confirmPortalApplicationConfirmation: mocks.confirmPortalApplicationConfirmation,
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
    "http://localhost/api/portal/token/application-confirmations/confirmation-id/confirm",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

describe("POST /api/portal/[token]/application-confirmations/[confirmationId]/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validatePortalToken.mockResolvedValue({
      tokenId: "token-id",
      caseId: "case-id",
    });
    mocks.requirePortalPreValidationRateLimit.mockResolvedValue(undefined);
    mocks.requirePortalPostValidationRateLimit.mockResolvedValue(undefined);
    mocks.confirmPortalApplicationConfirmation.mockResolvedValue({
      id: "confirmation-id",
      title: "Application",
      version: 1,
      status: "confirmed",
      confirmedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2025-12-01T00:00:00.000Z",
    });
  });

  it("ignores body.caseId and calls portalServices with token, confirmationId, and reason only", async () => {
    const response = await POST(
      createRequest({
        caseId: "attacker-case",
        status: "confirmed",
        confirmedAt: "1999-01-01T00:00:00.000Z",
        storagePath: "cases/attacker/application.pdf",
        reason: "client confirmed",
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
    expect(mocks.confirmPortalApplicationConfirmation).toHaveBeenCalledWith({
      token: "portal-token",
      confirmationId: "confirmation-id",
      reason: "client confirmed",
    });
    expect(payload.data.status).toBe("confirmed");
  });

  it("does not include forbidden fields or signedUrl in the response", async () => {
    const response = await POST(createRequest({ reason: "client confirmed" }), {
      params: Promise.resolve({
        token: "portal-token",
        confirmationId: "confirmation-id",
      }),
    });
    const payload = JSON.stringify(await response.json());

    for (const field of forbiddenFields) {
      expect(payload).not.toContain(field);
    }
  });

  it("maps confirmation access errors safely", async () => {
    const error = new Error("storagePath must not leak");
    error.name = "PortalApplicationConfirmationAccessError";
    mocks.confirmPortalApplicationConfirmation.mockRejectedValue(error);

    const response = await POST(createRequest({}), {
      params: Promise.resolve({
        token: "portal-token",
        confirmationId: "confirmation-id",
      }),
    });
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe("CONFIRMATION_NOT_ACCESSIBLE");
    expect(JSON.stringify(payload)).not.toContain("storagePath");
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
    expect(mocks.confirmPortalApplicationConfirmation).not.toHaveBeenCalled();
  });

  it("does not import prisma or admin services", () => {
    const source = readFileSync(resolve(__dirname, "route.ts"), "utf8");

    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("adminServices");
  });
});
