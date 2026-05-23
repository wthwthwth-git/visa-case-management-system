import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminDocumentTemplateById: vi.fn(),
  requireAdminAuth: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  adminServices: {
    getAdminDocumentTemplateById: mocks.getAdminDocumentTemplateById,
  },
}));

vi.mock("@/lib/api/admin-auth", () => ({
  requireAdminAuth: mocks.requireAdminAuth,
}));

import { GET } from "./route";

describe("GET /api/admin/templates/[templateId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminAuth.mockResolvedValue({ adminId: "development-admin" });
    mocks.getAdminDocumentTemplateById.mockResolvedValue({
      id: "template-id",
      templateKey: "engineer",
      version: 3,
      title: "Engineer template",
      templateDescription: "Template description",
      status: "active",
      currentVisaType: "student",
      targetVisaType: "engineer",
      createdAt: "2025-12-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      items: [
        {
          id: "item-id",
          itemKey: "passport",
          title: "Passport",
          customerInstruction: "Upload passport.",
          internalNote: "Check expiry.",
          isRequired: true,
          responsibleParty: "customer",
          sortOrder: 10,
          acceptedFileTypesDescription: "PDF",
        },
      ],
    });
  });

  it("requires admin auth and uses route templateId", async () => {
    const request = new Request("http://localhost/api/admin/templates/template-id");

    const response = await GET(request, {
      params: Promise.resolve({ templateId: "template-id" }),
    });
    const payload = await response.json();

    expect(mocks.requireAdminAuth).toHaveBeenCalledWith(request);
    expect(mocks.getAdminDocumentTemplateById).toHaveBeenCalledWith("template-id");
    expect(payload.data.items[0]).toMatchObject({
      customerInstruction: "Upload passport.",
      internalNote: "Check expiry.",
    });
  });

  it("returns data null when template is not found", async () => {
    mocks.getAdminDocumentTemplateById.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/admin/templates/missing"), {
      params: Promise.resolve({ templateId: "missing" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ data: null });
  });

  it("maps auth failure to ADMIN_AUTH_REQUIRED and does not call service", async () => {
    const error = new Error("auth required");
    error.name = "AdminAuthNotImplementedError";
    mocks.requireAdminAuth.mockRejectedValue(error);

    const response = await GET(new Request("http://localhost/api/admin/templates/template-id"), {
      params: Promise.resolve({ templateId: "template-id" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("ADMIN_AUTH_REQUIRED");
    expect(mocks.getAdminDocumentTemplateById).not.toHaveBeenCalled();
  });

  it("does not include storage, token, signed URL, or Prisma internals in the response", async () => {
    const response = await GET(new Request("http://localhost/api/admin/templates/template-id"), {
      params: Promise.resolve({ templateId: "template-id" }),
    });
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
