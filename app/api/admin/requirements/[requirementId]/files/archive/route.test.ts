import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminRequirementFilesArchive: vi.fn(),
  requireAdminAuth: vi.fn(),
  requireAdminCsrf: vi.fn(),
  requireAdminUploadRateLimit: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  adminServices: {
    createAdminRequirementFilesArchive: mocks.createAdminRequirementFilesArchive,
  },
}));

vi.mock("@/lib/api/admin-auth", () => ({
  requireAdminAuth: mocks.requireAdminAuth,
}));

vi.mock("@/lib/api/csrf", () => ({
  requireAdminCsrf: mocks.requireAdminCsrf,
}));

vi.mock("@/lib/rate-limit", () => ({
  requireAdminUploadRateLimit: mocks.requireAdminUploadRateLimit,
}));

import { POST } from "./route";

describe("POST /api/admin/requirements/[requirementId]/files/archive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminAuth.mockResolvedValue({
      adminId: "admin-id",
      email: "admin@example.com",
    });
    mocks.requireAdminCsrf.mockResolvedValue(undefined);
    mocks.requireAdminUploadRateLimit.mockResolvedValue(undefined);
    mocks.createAdminRequirementFilesArchive.mockResolvedValue({
      fileName: "passport.zip",
      mimeType: "application/zip",
      body: new Uint8Array([1, 2, 3]),
      storagePath: "do-not-return",
    });
  });

  it("returns a zip archive and calls service with route requirementId", async () => {
    const request = new Request(
      "http://localhost/api/admin/requirements/requirement-id/files/archive",
      {
        method: "POST",
        body: JSON.stringify({ requirementId: "body-id", storagePath: "do-not-pass" }),
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({ requirementId: "route-requirement-id" }),
    });
    const body = new Uint8Array(await response.arrayBuffer());

    expect(mocks.requireAdminAuth).toHaveBeenCalledWith(request);
    expect(mocks.requireAdminCsrf).toHaveBeenCalledWith(request);
    expect(mocks.requireAdminUploadRateLimit).toHaveBeenCalledWith(request, {
      adminId: "admin-id",
      email: "admin@example.com",
      requirementId: "route-requirement-id",
    });
    expect(mocks.createAdminRequirementFilesArchive).toHaveBeenCalledWith({
      requirementId: "route-requirement-id",
    });
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    expect(response.headers.get("Content-Disposition")).toContain("passport.zip");
    expect(Array.from(body)).toEqual([1, 2, 3]);
  });

  it("maps archive access errors safely", async () => {
    const error = new Error("storagePath must not leak");
    error.name = "FileNotAccessibleError";
    mocks.createAdminRequirementFilesArchive.mockRejectedValue(error);

    const response = await POST(
      new Request("http://localhost/api/admin/requirements/requirement-id/files/archive", {
        method: "POST",
      }),
      {
        params: Promise.resolve({ requirementId: "route-requirement-id" }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe("FILE_NOT_ACCESSIBLE");
    expect(JSON.stringify(payload)).not.toContain("storagePath");
  });

  it("does not import prisma, portal services, direct storage fields, or timeline writers", () => {
    const source = readFileSync(resolve(__dirname, "route.ts"), "utf8");

    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("@prisma/client");
    expect(source).not.toContain("portalServices");
    expect(source).not.toContain("storagePath");
    expect(source).not.toContain("storageBucket");
    expect(source).not.toContain("createTimelineEvent");
  });
});
