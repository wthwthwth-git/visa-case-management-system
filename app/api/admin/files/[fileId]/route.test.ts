import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  removeAdminDocumentFile: vi.fn(),
  requireAdminAuth: vi.fn(),
  requireAdminCsrf: vi.fn(),
  requireAdminRateLimit: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  adminServices: {
    removeAdminDocumentFile: mocks.removeAdminDocumentFile,
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

import { DELETE } from "./route";

describe("DELETE /api/admin/files/[fileId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminAuth.mockResolvedValue({
      adminId: "admin-id",
      email: "admin@example.com",
    });
    mocks.requireAdminCsrf.mockResolvedValue(undefined);
    mocks.requireAdminRateLimit.mockResolvedValue(undefined);
    mocks.removeAdminDocumentFile.mockResolvedValue({
      fileId: "route-file-id",
      requirementId: "requirement-id",
      status: "removed",
      removedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("requires auth, csrf, rate limit, and deletes the route file id only", async () => {
    const request = new Request("http://localhost/api/admin/files/route-file-id", {
      method: "DELETE",
      body: JSON.stringify({
        fileId: "body-file-id",
        reason: "mistaken upload",
        storagePath: "cases/case/file.pdf",
        storageBucket: "case-files",
        tokenHash: "do-not-pass",
      }),
    });

    const response = await DELETE(request, {
      params: Promise.resolve({ fileId: "route-file-id" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.requireAdminAuth).toHaveBeenCalledWith(request);
    expect(mocks.requireAdminCsrf).toHaveBeenCalledWith(request);
    expect(mocks.requireAdminRateLimit).toHaveBeenCalledWith(request, {
      adminId: "admin-id",
      email: "admin@example.com",
      routeGroup: "admin_destructive",
    });
    expect(mocks.removeAdminDocumentFile).toHaveBeenCalledWith({
      fileId: "route-file-id",
      reason: "mistaken upload",
    });
    expect(JSON.stringify(mocks.removeAdminDocumentFile.mock.calls[0][0])).not.toContain(
      "body-file-id",
    );
    expect(JSON.stringify(payload)).not.toContain("storagePath");
    expect(JSON.stringify(payload)).not.toContain("storageBucket");
    expect(JSON.stringify(payload)).not.toContain("tokenHash");
  });

  it("does not call service when csrf fails", async () => {
    const error = new Error("bad csrf");
    error.name = "AdminCsrfError";
    mocks.requireAdminCsrf.mockRejectedValue(error);

    const response = await DELETE(
      new Request("http://localhost/api/admin/files/route-file-id", {
        method: "DELETE",
      }),
      {
        params: Promise.resolve({ fileId: "route-file-id" }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error.code).toBe("ADMIN_CSRF_REQUIRED");
    expect(mocks.removeAdminDocumentFile).not.toHaveBeenCalled();
  });

  it("maps file delete errors safely", async () => {
    const error = new Error("storagePath must not leak");
    error.name = "AdminFileDeleteAccessError";
    mocks.removeAdminDocumentFile.mockRejectedValue(error);

    const response = await DELETE(
      new Request("http://localhost/api/admin/files/route-file-id", {
        method: "DELETE",
      }),
      {
        params: Promise.resolve({ fileId: "route-file-id" }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
    expect(JSON.stringify(payload)).not.toContain("storagePath");
  });

  it("does not import prisma, portal services, direct storage deletion, or timeline writers", () => {
    const source = readFileSync(resolve(__dirname, "route.ts"), "utf8");

    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("@prisma/client");
    expect(source).not.toContain("portalServices");
    expect(source).not.toContain("deleteStorageObject");
    expect(source).not.toContain("storage-upload");
    expect(source).not.toContain("createTimelineEvent");
  });
});
