import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reviewCaseDocumentRequirement: vi.fn(),
  requireAdminAuth: vi.fn(),
  requireAdminCsrf: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  adminServices: {
    reviewCaseDocumentRequirement: mocks.reviewCaseDocumentRequirement,
  },
}));

vi.mock("@/lib/api/admin-auth", () => ({
  requireAdminAuth: mocks.requireAdminAuth,
}));

vi.mock("@/lib/api/csrf", () => ({
  requireAdminCsrf: mocks.requireAdminCsrf,
}));

import { PATCH } from "./route";

function createRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/requirements/route-requirement-id/status", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/admin/requirements/[requirementId]/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminAuth.mockResolvedValue({ adminId: "development-admin" });
    mocks.requireAdminCsrf.mockResolvedValue(undefined);
    mocks.reviewCaseDocumentRequirement.mockResolvedValue({
      id: "route-requirement-id",
      caseId: "case-id",
      title: "Passport",
      status: "approved",
      customerInstruction: "Customer instruction",
      internalNote: "Admin note",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("requires admin auth and calls reviewCaseDocumentRequirement with allowed fields only", async () => {
    const request = createRequest({
      caseId: "case-id",
      requirementId: "body-requirement-id",
      newStatus: "approved",
      reason: "checked",
      customerInstruction: "Customer instruction",
      internalNote: "Admin note",
      sourceType: "immigration_request",
      tokenHash: "do-not-pass",
      storagePath: "cases/case-id/file.pdf",
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ requirementId: "route-requirement-id" }),
    });
    const payload = await response.json();
    const serviceArg = mocks.reviewCaseDocumentRequirement.mock.calls[0][0];

    expect(mocks.requireAdminAuth).toHaveBeenCalledWith(request);
    expect(serviceArg).toEqual({
      caseId: "case-id",
      requirementId: "route-requirement-id",
      newStatus: "approved",
      reason: "checked",
      customerInstruction: "Customer instruction",
      internalNote: "Admin note",
    });
    expect(JSON.stringify(serviceArg)).not.toContain("body-requirement-id");
    expect(JSON.stringify(serviceArg)).not.toContain("sourceType");
    expect(JSON.stringify(serviceArg)).not.toContain("tokenHash");
    expect(JSON.stringify(serviceArg)).not.toContain("storagePath");
    expect(payload.data.id).toBe("route-requirement-id");
  });

  it("returns INVALID_REQUEST for missing required route input", async () => {
    const response = await PATCH(
      createRequest({
        caseId: "case-id",
        newStatus: "not-a-status",
      }),
      {
        params: Promise.resolve({ requirementId: "route-requirement-id" }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
    expect(mocks.reviewCaseDocumentRequirement).not.toHaveBeenCalled();
  });

  it("maps review transition errors to INVALID_REQUEST", async () => {
    const error = new Error("internalNote and storagePath must not leak");
    error.name = "InvalidRequirementStatusTransitionError";
    mocks.reviewCaseDocumentRequirement.mockRejectedValue(error);

    const response = await PATCH(
      createRequest({
        caseId: "case-id",
        newStatus: "approved",
      }),
      {
        params: Promise.resolve({ requirementId: "route-requirement-id" }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
    expect(JSON.stringify(payload)).not.toContain("storagePath");
    expect(JSON.stringify(payload)).not.toContain("internalNote");
  });

  it("does not import prisma or portal services", () => {
    const source = readFileSync(resolve(__dirname, "route.ts"), "utf8");

    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("@prisma/client");
    expect(source).not.toContain("portalServices");
  });
});
