import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listAdminCaseRequirements: vi.fn(),
  requireAdminAuth: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  adminServices: {
    listAdminCaseRequirements: mocks.listAdminCaseRequirements,
  },
}));

vi.mock("@/lib/api/admin-auth", () => ({
  requireAdminAuth: mocks.requireAdminAuth,
}));

import { GET } from "./route";

describe("GET /api/admin/cases/[caseId]/requirements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminAuth.mockResolvedValue({ adminId: "development-admin" });
    mocks.listAdminCaseRequirements.mockResolvedValue([
      {
        id: "requirement-id",
        internalNote: "admin-visible",
        files: [
          {
            id: "file-id",
            storageBucket: "case-files",
            storagePath: "cases/case-id/file.pdf",
          },
        ],
      },
    ]);
  });

  it("requires admin auth and returns admin requirement DTOs from service", async () => {
    const request = new Request("http://localhost/api/admin/cases/case-id/requirements");
    const response = await GET(request, {
      params: Promise.resolve({ caseId: "case-id" }),
    });
    const payload = await response.json();

    expect(mocks.requireAdminAuth).toHaveBeenCalledWith(request);
    expect(mocks.listAdminCaseRequirements).toHaveBeenCalledWith("case-id");
    expect(payload.data[0].internalNote).toBe("admin-visible");
    expect(payload.data[0].files[0].storagePath).toBe("cases/case-id/file.pdf");
  });

  it("does not import prisma or portal services", () => {
    const source = readFileSync(resolve(__dirname, "route.ts"), "utf8");

    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("portalServices");
  });
});
