import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listAdminDocumentTemplates: vi.fn(),
  requireAdminAuth: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  adminServices: {
    listAdminDocumentTemplates: mocks.listAdminDocumentTemplates,
  },
}));

vi.mock("@/lib/api/admin-auth", () => ({
  requireAdminAuth: mocks.requireAdminAuth,
}));

import { GET } from "./route";

describe("GET /api/admin/templates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminAuth.mockResolvedValue({ adminId: "development-admin" });
    mocks.listAdminDocumentTemplates.mockResolvedValue({
      items: [
        {
          id: "template-id",
          templateKey: "engineer",
          version: 3,
          title: "Engineer template",
          status: "active",
          currentVisaType: "student",
          targetVisaType: "engineer",
          itemCount: 12,
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      page: 2,
      pageSize: 10,
      total: 1,
    });
  });

  it("requires admin auth and passes query params to adminServices", async () => {
    const request = new Request(
      "http://localhost/api/admin/templates?q=engineer&status=active&currentVisaType=student&targetVisaType=engineer&templateKey=engineer&page=2&pageSize=10",
    );

    const response = await GET(request);
    const payload = await response.json();

    expect(mocks.requireAdminAuth).toHaveBeenCalledWith(request);
    expect(mocks.listAdminDocumentTemplates).toHaveBeenCalledWith({
      q: "engineer",
      status: "active",
      currentVisaType: "student",
      targetVisaType: "engineer",
      templateKey: "engineer",
      page: "2",
      pageSize: "10",
    });
    expect(payload.data.items[0]).toMatchObject({
      id: "template-id",
      itemCount: 12,
    });
  });

  it("maps auth failure to ADMIN_AUTH_REQUIRED and does not call service", async () => {
    const error = new Error("auth required");
    error.name = "AdminAuthNotImplementedError";
    mocks.requireAdminAuth.mockRejectedValue(error);

    const response = await GET(new Request("http://localhost/api/admin/templates"));
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("ADMIN_AUTH_REQUIRED");
    expect(mocks.listAdminDocumentTemplates).not.toHaveBeenCalled();
  });

  it("does not include storage, token, signed URL, or Prisma internals in the response", async () => {
    const response = await GET(new Request("http://localhost/api/admin/templates"));
    const payload = JSON.stringify(await response.json());

    expect(payload).not.toContain("storagePath");
    expect(payload).not.toContain("storageBucket");
    expect(payload).not.toContain("tokenHash");
    expect(payload).not.toContain("plaintextToken");
    expect(payload).not.toContain("signedUrl");
    expect(payload).not.toContain("_count");
  });

  it("does not import prisma, portal services, or mutation helpers", () => {
    const source = readFileSync(resolve(__dirname, "route.ts"), "utf8");

    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("@prisma/client");
    expect(source).not.toContain("portalServices");
    expect(source).not.toContain("applyDocumentTemplateToCase");
    expect(source).not.toContain("caseDocumentRequirement");
    expect(source).not.toContain("createTimelineEvent");
    expect(source).not.toContain(".create(");
    expect(source).not.toContain(".update(");
  });
});
