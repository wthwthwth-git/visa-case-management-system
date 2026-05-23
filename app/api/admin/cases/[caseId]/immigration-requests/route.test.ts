import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addImmigrationAdditionalRequirement: vi.fn(),
  requireAdminAuth: vi.fn(),
  requireAdminCsrf: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  adminServices: {
    addImmigrationAdditionalRequirement: mocks.addImmigrationAdditionalRequirement,
  },
}));

vi.mock("@/lib/api/admin-auth", () => ({
  requireAdminAuth: mocks.requireAdminAuth,
}));

vi.mock("@/lib/api/csrf", () => ({
  requireAdminCsrf: mocks.requireAdminCsrf,
}));

import { POST } from "./route";

function createRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/cases/route-case-id/immigration-requests", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/cases/[caseId]/immigration-requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminAuth.mockResolvedValue({ adminId: "development-admin" });
    mocks.requireAdminCsrf.mockResolvedValue(undefined);
    mocks.addImmigrationAdditionalRequirement.mockResolvedValue({
      id: "requirement-id",
      caseId: "route-case-id",
      title: "Additional document",
      responsibleParty: "customer",
      sourceType: "immigration_request",
      status: "not_submitted",
      portalVisible: true,
      portalDownloadable: false,
      customerInstruction: "Please upload.",
      internalNote: "Admin note",
      dueDate: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("requires admin auth and calls addImmigrationAdditionalRequirement with route caseId and allowed fields only", async () => {
    const request = createRequest({
      caseId: "body-case-id",
      title: "Additional document",
      responsibleParty: "customer",
      customerInstruction: "Please upload.",
      internalNote: "Admin note",
      dueDate: "2026-01-01T00:00:00.000Z",
      reason: "immigration requested",
      portalVisible: true,
      portalDownloadable: false,
      setCasePhase: true,
      sourceType: "template",
      sourceTemplateId: "template-id",
      storagePath: "cases/route-case-id/file.pdf",
      storageBucket: "case-files",
      file: "do-not-pass",
    });

    const response = await POST(request, {
      params: Promise.resolve({ caseId: "route-case-id" }),
    });
    const payload = await response.json();
    const serviceArg = mocks.addImmigrationAdditionalRequirement.mock.calls[0][0];

    expect(mocks.requireAdminAuth).toHaveBeenCalledWith(request);
    expect(serviceArg).toEqual({
      caseId: "route-case-id",
      title: "Additional document",
      responsibleParty: "customer",
      customerInstruction: "Please upload.",
      internalNote: "Admin note",
      dueDate: new Date("2026-01-01T00:00:00.000Z"),
      reason: "immigration requested",
      portalVisible: true,
      portalDownloadable: false,
      setCasePhase: true,
    });
    expect(JSON.stringify(serviceArg)).not.toContain("body-case-id");
    expect(JSON.stringify(serviceArg)).not.toContain("sourceType");
    expect(JSON.stringify(serviceArg)).not.toContain("sourceTemplateId");
    expect(JSON.stringify(serviceArg)).not.toContain("storagePath");
    expect(JSON.stringify(serviceArg)).not.toContain("storageBucket");
    expect(JSON.stringify(serviceArg)).not.toContain("file");
    expect(payload.data.sourceType).toBe("immigration_request");
    expect(JSON.stringify(payload)).not.toContain("storagePath");
    expect(JSON.stringify(payload)).not.toContain("storageBucket");
    expect(JSON.stringify(payload)).not.toContain("tokenHash");
  });

  it("returns INVALID_REQUEST for invalid dueDate", async () => {
    const response = await POST(
      createRequest({
        title: "Additional document",
        responsibleParty: "customer",
        dueDate: "not-a-date",
      }),
      {
        params: Promise.resolve({ caseId: "route-case-id" }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
    expect(mocks.addImmigrationAdditionalRequirement).not.toHaveBeenCalled();
  });

  it("maps immigration input errors to INVALID_REQUEST", async () => {
    const error = new Error("storageBucket must not leak");
    error.name = "InvalidImmigrationRequirementInputError";
    mocks.addImmigrationAdditionalRequirement.mockRejectedValue(error);

    const response = await POST(
      createRequest({
        title: "Additional document",
        responsibleParty: "customer",
      }),
      {
        params: Promise.resolve({ caseId: "route-case-id" }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
    expect(JSON.stringify(payload)).not.toContain("storageBucket");
  });

  it("does not import prisma or portal services", () => {
    const source = readFileSync(resolve(__dirname, "route.ts"), "utf8");

    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("@prisma/client");
    expect(source).not.toContain("portalServices");
  });
});
