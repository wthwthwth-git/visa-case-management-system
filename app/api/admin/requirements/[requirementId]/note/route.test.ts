import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateRequirementInternalNote: vi.fn(),
  requireAdminAuth: vi.fn(),
  requireAdminCsrf: vi.fn(),
  requireAdminRateLimit: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  adminServices: {
    updateRequirementInternalNote: mocks.updateRequirementInternalNote,
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

import { PATCH } from "./route";

describe("PATCH /api/admin/requirements/[requirementId]/note", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminAuth.mockResolvedValue({
      adminId: "admin-id",
      email: "admin@example.com",
    });
    mocks.requireAdminCsrf.mockResolvedValue(undefined);
    mocks.requireAdminRateLimit.mockResolvedValue(undefined);
    mocks.updateRequirementInternalNote.mockResolvedValue({
      id: "requirement-id",
      caseId: "case-id",
      title: "Passport",
      internalNote: "Admin note",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("requires auth, csrf, rate limit, and passes only whitelisted fields", async () => {
    const request = new Request("http://localhost/api/admin/requirements/route-requirement-id/note", {
      method: "PATCH",
      body: JSON.stringify({
        caseId: "case-id",
        requirementId: "body-requirement-id",
        internalNote: "Admin note",
        storagePath: "cases/file.pdf",
        tokenHash: "do-not-pass",
        signedUrl: "https://example.test/signed",
      }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ requirementId: "route-requirement-id" }),
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
    expect(mocks.updateRequirementInternalNote).toHaveBeenCalledWith({
      caseId: "case-id",
      requirementId: "route-requirement-id",
      internalNote: "Admin note",
    });
    expect(JSON.stringify(mocks.updateRequirementInternalNote.mock.calls[0][0])).not.toContain(
      "body-requirement-id",
    );
    expect(JSON.stringify(mocks.updateRequirementInternalNote.mock.calls[0][0])).not.toContain(
      "storagePath",
    );
    expect(JSON.stringify(mocks.updateRequirementInternalNote.mock.calls[0][0])).not.toContain(
      "tokenHash",
    );
    expect(payload.data.internalNote).toBe("Admin note");
  });

  it("returns INVALID_REQUEST when caseId is missing", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/admin/requirements/route-requirement-id/note", {
        method: "PATCH",
        body: JSON.stringify({
          internalNote: "Admin note",
        }),
      }),
      {
        params: Promise.resolve({ requirementId: "route-requirement-id" }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
    expect(mocks.updateRequirementInternalNote).not.toHaveBeenCalled();
  });

  it("maps note errors safely", async () => {
    const error = new Error("internalNote storagePath tokenHash should not leak");
    error.name = "InvalidRequirementNoteInputError";
    mocks.updateRequirementInternalNote.mockRejectedValue(error);

    const response = await PATCH(
      new Request("http://localhost/api/admin/requirements/route-requirement-id/note", {
        method: "PATCH",
        body: JSON.stringify({
          caseId: "case-id",
          internalNote: "Admin note",
        }),
      }),
      {
        params: Promise.resolve({ requirementId: "route-requirement-id" }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
    expect(JSON.stringify(payload)).not.toContain("storagePath");
    expect(JSON.stringify(payload)).not.toContain("tokenHash");
  });

  it("does not import prisma, portal services, storage, or timeline writers", () => {
    const source = readFileSync(resolve(__dirname, "route.ts"), "utf8");

    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("@prisma/client");
    expect(source).not.toContain("portalServices");
    expect(source).not.toContain("storage");
    expect(source).not.toContain("createTimelineEvent");
  });
});
