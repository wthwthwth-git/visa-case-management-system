import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminFileDownloadUrl: vi.fn(),
  requireAdminAuth: vi.fn(),
  requireAdminCsrf: vi.fn(),
  requireAdminRateLimit: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  adminServices: {
    getAdminFileDownloadUrl: mocks.getAdminFileDownloadUrl,
  },
}));

vi.mock("@/lib/api/admin-auth", () => ({
  requireAdminAuth: mocks.requireAdminAuth,
}));

vi.mock("@/lib/api/csrf", () => ({
  requireAdminCsrf: mocks.requireAdminCsrf,
}));

vi.mock("@/lib/rate-limit", () => ({
  requireAdminRateLimit: mocks.requireAdminRateLimit,
}));

import { POST } from "./route";

describe("POST /api/admin/files/[fileId]/signed-url", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminAuth.mockResolvedValue({
      adminId: "admin-id",
      email: "admin@example.com",
    });
    mocks.requireAdminCsrf.mockResolvedValue(undefined);
    mocks.requireAdminRateLimit.mockResolvedValue(undefined);
    mocks.getAdminFileDownloadUrl.mockResolvedValue({
      signedUrl: "https://storage.example.test/signed",
      expiresAt: new Date("2026-01-01T00:15:00.000Z"),
      storagePath: "do-not-return",
      storageBucket: "do-not-return",
    });
  });

  it("requires auth, csrf, rate limit, and calls admin service with route fileId", async () => {
    const request = new Request("http://localhost/api/admin/files/file-id/signed-url", {
      method: "POST",
      body: JSON.stringify({
        fileId: "body-file-id",
        storagePath: "cases/case/file.pdf",
        storageBucket: "case-files",
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ fileId: "route-file-id" }),
    });
    const payload = await response.json();

    expect(mocks.requireAdminAuth).toHaveBeenCalledWith(request);
    expect(mocks.requireAdminCsrf).toHaveBeenCalledWith(request);
    expect(mocks.requireAdminRateLimit).toHaveBeenCalledWith(request, {
      adminId: "admin-id",
      email: "admin@example.com",
      routeGroup: "admin_mutation",
    });
    expect(mocks.getAdminFileDownloadUrl).toHaveBeenCalledWith({
      fileId: "route-file-id",
    });
    expect(payload.data).toEqual({
      signedUrl: "https://storage.example.test/signed",
      expiresAt: "2026-01-01T00:15:00.000Z",
    });
    expect(JSON.stringify(payload)).not.toContain("storagePath");
    expect(JSON.stringify(payload)).not.toContain("storageBucket");
    expect(JSON.stringify(payload)).not.toContain("body-file-id");
  });

  it("maps service errors safely", async () => {
    const error = new Error("storagePath must not leak");
    error.name = "FileNotAccessibleError";
    mocks.getAdminFileDownloadUrl.mockRejectedValue(error);

    const response = await POST(
      new Request("http://localhost/api/admin/files/file-id/signed-url", {
        method: "POST",
      }),
      {
        params: Promise.resolve({ fileId: "route-file-id" }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe("FILE_NOT_ACCESSIBLE");
    expect(JSON.stringify(payload)).not.toContain("storagePath");
  });

  it("does not import prisma, portal services, storage path fields, or timeline writers", () => {
    const source = readFileSync(resolve(__dirname, "route.ts"), "utf8");

    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("@prisma/client");
    expect(source).not.toContain("portalServices");
    expect(source).not.toContain("storagePath");
    expect(source).not.toContain("storageBucket");
    expect(source).not.toContain("createTimelineEvent");
  });
});
