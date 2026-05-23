import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createPortalApplicationConfirmationSignedUrl: vi.fn(),
  validatePortalToken: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  portalServices: {
    createPortalApplicationConfirmationSignedUrl:
      mocks.createPortalApplicationConfirmationSignedUrl,
    validatePortalToken: mocks.validatePortalToken,
  },
}));

import { POST } from "./route";

describe("POST /api/portal/[token]/application-confirmations/[confirmationId]/signed-url", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validatePortalToken.mockResolvedValue({
      tokenId: "token-id",
      caseId: "case-id",
    });
    mocks.createPortalApplicationConfirmationSignedUrl.mockResolvedValue({
      signedUrl: "https://signed.example.test/application",
      expiresAt: new Date("2026-01-01T00:05:00.000Z"),
    });
  });

  it("ignores body.caseId and calls portalServices with token and confirmationId only", async () => {
    const response = await POST(
      new Request(
        "http://localhost/api/portal/token/application-confirmations/confirmation-id/signed-url",
        {
          method: "POST",
          body: JSON.stringify({ caseId: "attacker-case" }),
        },
      ),
      {
        params: Promise.resolve({
          token: "portal-token",
          confirmationId: "confirmation-id",
        }),
      },
    );
    const payload = await response.json();

    expect(mocks.createPortalApplicationConfirmationSignedUrl).toHaveBeenCalledWith({
      token: "portal-token",
      confirmationId: "confirmation-id",
    });
    expect(payload.data).toEqual({
      signedUrl: "https://signed.example.test/application",
      expiresAt: "2026-01-01T00:05:00.000Z",
    });
  });

  it("returns only signedUrl and expiresAt", async () => {
    const response = await POST(
      new Request(
        "http://localhost/api/portal/token/application-confirmations/confirmation-id/signed-url",
        {
          method: "POST",
        },
      ),
      {
        params: Promise.resolve({
          token: "portal-token",
          confirmationId: "confirmation-id",
        }),
      },
    );
    const payload = await response.json();

    expect(Object.keys(payload.data)).toEqual(["signedUrl", "expiresAt"]);
    expect(JSON.stringify(payload)).not.toContain("storagePath");
    expect(JSON.stringify(payload)).not.toContain("storageBucket");
  });

  it("maps confirmation access errors to safe error responses", async () => {
    const error = new Error("confirmation storagePath must not leak");
    error.name = "PortalApplicationConfirmationAccessError";
    mocks.createPortalApplicationConfirmationSignedUrl.mockRejectedValue(error);

    const response = await POST(
      new Request(
        "http://localhost/api/portal/token/application-confirmations/confirmation-id/signed-url",
        {
          method: "POST",
        },
      ),
      {
        params: Promise.resolve({
          token: "portal-token",
          confirmationId: "confirmation-id",
        }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload).toEqual({
      error: {
        code: "CONFIRMATION_NOT_ACCESSIBLE",
        message: "Application confirmation is not accessible.",
      },
    });
    expect(JSON.stringify(payload)).not.toContain("storagePath");
  });

  it("does not import prisma or admin services", () => {
    const source = readFileSync(resolve(__dirname, "route.ts"), "utf8");

    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("adminServices");
  });
});
