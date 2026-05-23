import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revokeActivePortalTokenForCase: vi.fn(),
  requireAdminAuth: vi.fn(),
  requireAdminCsrf: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  adminServices: {
    revokeActivePortalTokenForCase: mocks.revokeActivePortalTokenForCase,
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
  return new Request("http://localhost/api/admin/cases/case-id/token/revoke", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/cases/[caseId]/token/revoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminAuth.mockResolvedValue({ adminId: "development-admin" });
    mocks.requireAdminCsrf.mockResolvedValue(undefined);
    mocks.revokeActivePortalTokenForCase.mockResolvedValue({
      revokedTokenId: "revoked-token-id",
    });
  });

  it("requires admin auth and calls adminServices with route caseId and reason only", async () => {
    const request = createRequest({
      caseId: "attacker-case",
      reason: "manual revoke",
      tokenHash: "do-not-pass",
      plaintextToken: "request-plaintext-token",
      status: "revoked",
      storagePath: "cases/case-id/file.pdf",
      storageBucket: "case-files",
    });
    const response = await POST(request, {
      params: Promise.resolve({ caseId: "case-id" }),
    });
    const payload = await response.json();
    const serviceArg = mocks.revokeActivePortalTokenForCase.mock.calls[0][0];

    expect(mocks.requireAdminAuth).toHaveBeenCalledWith(request);
    expect(serviceArg).toEqual({
      caseId: "case-id",
      reason: "manual revoke",
    });
    expect(JSON.stringify(serviceArg)).not.toContain("attacker-case");
    expect(JSON.stringify(serviceArg)).not.toContain("do-not-pass");
    expect(JSON.stringify(serviceArg)).not.toContain("request-plaintext-token");
    expect(payload.data).toEqual({
      revokedTokenId: "revoked-token-id",
    });
    expect(JSON.stringify(payload)).not.toContain("plaintextToken");
    expect(JSON.stringify(payload)).not.toContain("tokenHash");
    expect(JSON.stringify(payload)).not.toContain("storagePath");
    expect(JSON.stringify(payload)).not.toContain("storageBucket");
  });

  it("returns null revokedTokenId without plaintextToken when no active token exists", async () => {
    mocks.revokeActivePortalTokenForCase.mockResolvedValue({
      revokedTokenId: null,
    });

    const response = await POST(createRequest({ reason: "no active token" }), {
      params: Promise.resolve({ caseId: "case-id" }),
    });
    const payload = await response.json();

    expect(payload).toEqual({
      data: {
        revokedTokenId: null,
      },
    });
    expect(JSON.stringify(payload)).not.toContain("plaintextToken");
    expect(JSON.stringify(payload)).not.toContain("tokenHash");
  });

  it("maps InvalidTokenReasonError to INVALID_REQUEST", async () => {
    const error = new Error("tokenHash must not leak");
    error.name = "InvalidTokenReasonError";
    mocks.revokeActivePortalTokenForCase.mockRejectedValue(error);

    const response = await POST(createRequest({ reason: "contains token" }), {
      params: Promise.resolve({ caseId: "case-id" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
    expect(JSON.stringify(payload)).not.toContain("tokenHash");
  });

  it("does not import prisma, portal services, or console logging", () => {
    const source = readFileSync(resolve(__dirname, "route.ts"), "utf8");

    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("portalServices");
    expect(source).not.toContain("console.");
  });
});
