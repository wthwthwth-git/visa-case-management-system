import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminCaseById: vi.fn(),
  requireAdminAuth: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  adminServices: {
    getAdminCaseById: mocks.getAdminCaseById,
  },
}));

vi.mock("@/lib/api/admin-auth", () => ({
  requireAdminAuth: mocks.requireAdminAuth,
}));

import { GET } from "./route";

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
