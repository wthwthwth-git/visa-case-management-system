import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminCaseById: vi.fn(),
  removeAdminCase: vi.fn(),
  requireAdminAuth: vi.fn(),
  requireAdminCsrf: vi.fn(),
  requireAdminRateLimit: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  adminServices: {
    getAdminCaseById: mocks.getAdminCaseById,
    removeAdminCase: mocks.removeAdminCase,
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

import { DELETE, GET } from "./route";

describe("GET /api/admin/cases/[caseId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminAuth.mockResolvedValue({ adminId: "development-admin" });
    mocks.getAdminCaseById.mockResolvedValue({
      id: "case-id",
      caseNumber: "CASE-001",
      customer: {
        id: "customer-id",
        name: "Seed Customer",
        passportNumber: "admin-visible",
      },
    });
  });

  it("requires admin auth and returns admin case DTO from service", async () => {
    const request = new Request("http://localhost/api/admin/cases/case-id");
    const response = await GET(request, {
      params: Promise.resolve({ caseId: "case-id" }),
    });
    const payload = await response.json();

    expect(mocks.requireAdminAuth).toHaveBeenCalledWith(request);
    expect(mocks.getAdminCaseById).toHaveBeenCalledWith("case-id");
    expect(payload.data.id).toBe("case-id");
    expect(payload.data.customer.passportNumber).toBe("admin-visible");
  });

  it("does not import prisma or portal services", () => {
    const source = readFileSync(resolve(__dirname, "route.ts"), "utf8");

    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("portalServices");
  });
});

describe("DELETE /api/admin/cases/[caseId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminAuth.mockResolvedValue({
      adminId: "admin-1",
      email: "admin@example.com",
      role: "admin",
    });
    mocks.removeAdminCase.mockResolvedValue({
      caseId: "case-route",
      caseNumber: "CASE-001",
      removedRequirementCount: 3,
      removedFileCount: 2,
      removedApplicationConfirmationCount: 1,
      removedAccessTokenCount: 1,
    });
  });

  it("requires auth, csrf, rate limit and deletes by route caseId", async () => {
    const request = new Request("http://localhost/api/admin/cases/case-route", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caseId: "body-case",
        tokenHash: "ignored",
        storagePath: "ignored",
      }),
    });
    const response = await DELETE(request, {
      params: Promise.resolve({ caseId: "case-route" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.caseId).toBe("case-route");
    expect(mocks.requireAdminAuth).toHaveBeenCalledWith(request);
    expect(mocks.requireAdminCsrf).toHaveBeenCalledWith(request);
    expect(mocks.requireAdminRateLimit).toHaveBeenCalledWith(request, {
      adminId: "admin-1",
      email: "admin@example.com",
      routeGroup: "admin_destructive",
    });
    expect(mocks.removeAdminCase).toHaveBeenCalledWith({ caseId: "case-route" });
    expect(JSON.stringify(mocks.removeAdminCase.mock.calls[0][0])).not.toContain("body-case");
    expect(JSON.stringify(mocks.removeAdminCase.mock.calls[0][0])).not.toContain("tokenHash");
    expect(JSON.stringify(mocks.removeAdminCase.mock.calls[0][0])).not.toContain("storagePath");
  });

  it("maps case delete service errors safely", async () => {
    const error = new Error("cannot delete");
    error.name = "CaseDeleteAccessError";
    mocks.removeAdminCase.mockRejectedValue(error);

    const response = await DELETE(
      new Request("http://localhost/api/admin/cases/case-route", { method: "DELETE" }),
      {
        params: Promise.resolve({ caseId: "case-route" }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
  });

  it("does not call service when csrf fails", async () => {
    const error = new Error("csrf failed");
    error.name = "AdminCsrfError";
    mocks.requireAdminCsrf.mockRejectedValue(error);

    const response = await DELETE(
      new Request("http://localhost/api/admin/cases/case-route", { method: "DELETE" }),
      {
        params: Promise.resolve({ caseId: "case-route" }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error.code).toBe("ADMIN_CSRF_REQUIRED");
    expect(mocks.removeAdminCase).not.toHaveBeenCalled();
  });

  it("does not import prisma or portal services for delete route", () => {
    const source = readFileSync(resolve(__dirname, "route.ts"), "utf8");

    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("portalServices");
  });
});
