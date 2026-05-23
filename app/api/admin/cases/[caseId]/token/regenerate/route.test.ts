import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  regeneratePortalTokenForCase: vi.fn(),
  requireAdminAuth: vi.fn(),
  requireAdminCsrf: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  adminServices: {
    regeneratePortalTokenForCase: mocks.regeneratePortalTokenForCase,
  },
}));

vi.mock("@/lib/api/admin-auth", () => ({
  requireAdminAuth: mocks.requireAdminAuth,
}));

vi.mock("@/lib/api/csrf", () => ({
  requireAdminCsrf: mocks.requireAdminCsrf,
}));

import { POST } from "./route";

function createRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/cases/case-id/token/regenerate", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/cases/[caseId]/token/regenerate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminAuth.mockResolvedValue({ adminId: "development-admin" });
    mocks.requireAdminCsrf.mockResolvedValue(undefined);
    mocks.regeneratePortalTokenForCase.mockResolvedValue({
      previousTokenId: "old-token-id",
      newTokenId: "new-token-id",
      plaintextToken: "service-plaintext-token",
      expiresAt: new Date("2026-01-01T00:00:00.000Z"),
    });
  });

  it("requires admin auth and calls adminServices with route caseId and allowed fields only", async () => {
    const request = createRequest({
      caseId: "attacker-case",
      reason: "manual rotate",
      expiresAt: "2026-01-01T00:00:00.000Z",
      tokenHash: "do-not-pass",
      plaintextToken: "request-plaintext-token",
      status: "active",
      storagePath: "cases/case-id/file.pdf",
      storageBucket: "case-files",
    });
    const response = await POST(request, {
      params: Promise.resolve({ caseId: "case-id" }),
    });
    const payload = await response.json();
    const serviceArg = mocks.regeneratePortalTokenForCase.mock.calls[0][0];

    expect(mocks.requireAdminAuth).toHaveBeenCalledWith(request);
    expect(serviceArg).toEqual({
      caseId: "case-id",
      reason: "manual rotate",
      expiresAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(JSON.stringify(serviceArg)).not.toContain("attacker-case");
    expect(JSON.stringify(serviceArg)).not.toContain("do-not-pass");
    expect(JSON.stringify(serviceArg)).not.toContain("request-plaintext-token");
    expect(payload.data.plaintextToken).toBe("service-plaintext-token");
    expect(JSON.stringify(payload)).not.toContain("tokenHash");
    expect(JSON.stringify(payload)).not.toContain("storagePath");
    expect(JSON.stringify(payload)).not.toContain("storageBucket");
    expect(JSON.stringify(payload)).not.toContain("request-plaintext-token");
  });

  it("maps InvalidTokenReasonError to INVALID_REQUEST", async () => {
    const error = new Error("tokenHash must not leak");
    error.name = "InvalidTokenReasonError";
    mocks.regeneratePortalTokenForCase.mockRejectedValue(error);

    const response = await POST(createRequest({ reason: "contains token" }), {
      params: Promise.resolve({ caseId: "case-id" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "Invalid request.",
      },
    });
    expect(JSON.stringify(payload)).not.toContain("tokenHash");
  });

  it("maps auth failure to ADMIN_AUTH_REQUIRED and does not call service", async () => {
    const error = new Error("auth required");
    error.name = "AdminAuthNotImplementedError";
    mocks.requireAdminAuth.mockRejectedValue(error);

    const response = await POST(createRequest({}), {
      params: Promise.resolve({ caseId: "case-id" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("ADMIN_AUTH_REQUIRED");
    expect(mocks.regeneratePortalTokenForCase).not.toHaveBeenCalled();
  });

  it("does not import prisma, portal services, or console logging", () => {
    const source = readFileSync(resolve(__dirname, "route.ts"), "utf8");

    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("portalServices");
    expect(source).not.toContain("console.");
  });
});
