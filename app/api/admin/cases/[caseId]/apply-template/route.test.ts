import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applyDocumentTemplateToCase: vi.fn(),
  requireAdminAuth: vi.fn(),
  requireAdminCsrf: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  adminServices: {
    applyDocumentTemplateToCase: mocks.applyDocumentTemplateToCase,
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
  return new Request("http://localhost/api/admin/cases/route-case-id/apply-template", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/cases/[caseId]/apply-template", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminAuth.mockResolvedValue({ adminId: "development-admin" });
    mocks.requireAdminCsrf.mockResolvedValue(undefined);
    mocks.applyDocumentTemplateToCase.mockResolvedValue({
      caseId: "route-case-id",
      templateId: "template-id",
      templateKey: "engineer",
      templateVersion: 3,
      copiedRequirementCount: 2,
      requirementIds: ["requirement-1", "requirement-2"],
    });
  });

  it("requires admin auth and calls applyDocumentTemplateToCase with route caseId and whitelisted fields only", async () => {
    const request = createRequest({
      caseId: "body-case-id",
      templateId: "template-id",
      templateKey: "engineer",
      version: 3,
      allowMultipleTemplates: true,
      reason: "initial setup",
      sourceType: "custom",
      sourceTemplateId: "attacker-template-id",
      sourceTemplateVersion: 99,
      sourceTemplateItemId: "attacker-item-id",
      requirements: [{ id: "do-not-pass" }],
      documentRequirements: [{ id: "do-not-pass" }],
      items: [{ id: "do-not-pass" }],
      status: "approved",
      casePhase: "approved",
      phase: "approved",
      portalVisible: true,
      portalDownloadable: true,
      customerInstruction: "do not pass",
      internalNote: "do not pass",
      storagePath: "cases/case-id/file.pdf",
      storageBucket: "case-files",
      signedUrl: "https://example.com/signed",
      token: "do-not-pass",
      tokenHash: "do-not-pass",
      plaintextToken: "do-not-pass",
      metadata: { doNotPass: true },
      timeline: "do-not-pass",
      eventType: "template_items_copied",
      actorId: "operator-id",
      actorType: "internal",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const response = await POST(request, {
      params: Promise.resolve({ caseId: "route-case-id" }),
    });
    const payload = await response.json();
    const serviceArg = mocks.applyDocumentTemplateToCase.mock.calls[0][0];

    expect(mocks.requireAdminAuth).toHaveBeenCalledWith(request);
    expect(serviceArg).toEqual({
      caseId: "route-case-id",
      templateId: "template-id",
      templateKey: "engineer",
      version: 3,
      allowMultipleTemplates: true,
      reason: "initial setup",
    });
    expect(JSON.stringify(serviceArg)).not.toContain("body-case-id");
    expect(JSON.stringify(serviceArg)).not.toContain("sourceType");
    expect(JSON.stringify(serviceArg)).not.toContain("sourceTemplateId");
    expect(JSON.stringify(serviceArg)).not.toContain("documentRequirements");
    expect(JSON.stringify(serviceArg)).not.toContain("internalNote");
    expect(JSON.stringify(serviceArg)).not.toContain("customerInstruction");
    expect(JSON.stringify(serviceArg)).not.toContain("storagePath");
    expect(JSON.stringify(serviceArg)).not.toContain("tokenHash");
    expect(JSON.stringify(serviceArg)).not.toContain("signedUrl");
    expect(payload.data).toEqual({
      caseId: "route-case-id",
      templateId: "template-id",
      templateKey: "engineer",
      templateVersion: 3,
      copiedRequirementCount: 2,
      requirementIds: ["requirement-1", "requirement-2"],
    });
  });

  it("supports templateKey plus version", async () => {
    await POST(createRequest({ templateKey: "engineer", version: 3 }), {
      params: Promise.resolve({ caseId: "route-case-id" }),
    });

    expect(mocks.applyDocumentTemplateToCase).toHaveBeenCalledWith({
      caseId: "route-case-id",
      templateId: undefined,
      templateKey: "engineer",
      version: 3,
      allowMultipleTemplates: undefined,
      reason: undefined,
    });
  });

  it("supports templateKey only for latest active selection by service", async () => {
    await POST(createRequest({ templateKey: "engineer" }), {
      params: Promise.resolve({ caseId: "route-case-id" }),
    });

    expect(mocks.applyDocumentTemplateToCase).toHaveBeenCalledWith({
      caseId: "route-case-id",
      templateId: undefined,
      templateKey: "engineer",
      version: undefined,
      allowMultipleTemplates: undefined,
      reason: undefined,
    });
  });

  it.each([
    ["zero version", { templateId: "template-id", version: 0 }],
    ["negative version", { templateId: "template-id", version: -1 }],
    ["decimal version", { templateId: "template-id", version: 1.5 }],
    ["string version", { templateId: "template-id", version: "3" }],
  ])("returns INVALID_REQUEST for invalid %s", async (_label, body) => {
    const response = await POST(createRequest(body), {
      params: Promise.resolve({ caseId: "route-case-id" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
    expect(mocks.applyDocumentTemplateToCase).not.toHaveBeenCalled();
  });

  it.each([
    ["missing selector", {}],
    ["invalid templateId", { templateId: 123 }],
    ["invalid templateKey", { templateKey: 123 }],
    ["invalid allowMultipleTemplates", { templateId: "template-id", allowMultipleTemplates: "yes" }],
    ["invalid reason", { templateId: "template-id", reason: 123 }],
  ])("returns INVALID_REQUEST for %s", async (_label, body) => {
    const response = await POST(createRequest(body), {
      params: Promise.resolve({ caseId: "route-case-id" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
    expect(mocks.applyDocumentTemplateToCase).not.toHaveBeenCalled();
  });

  it.each([
    "InvalidTemplateApplyInputError",
    "TemplateApplyAccessError",
    "TemplateAlreadyAppliedError",
  ])("maps %s to INVALID_REQUEST", async (errorName) => {
    const error = new Error("internalNote storagePath tokenHash should not leak");
    error.name = errorName;
    mocks.applyDocumentTemplateToCase.mockRejectedValue(error);

    const response = await POST(createRequest({ templateId: "template-id" }), {
      params: Promise.resolve({ caseId: "route-case-id" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
    expect(JSON.stringify(payload)).not.toContain("internalNote");
    expect(JSON.stringify(payload)).not.toContain("storagePath");
    expect(JSON.stringify(payload)).not.toContain("tokenHash");
  });

  it("maps auth failure to ADMIN_AUTH_REQUIRED and does not call service", async () => {
    const error = new Error("auth required");
    error.name = "AdminAuthNotImplementedError";
    mocks.requireAdminAuth.mockRejectedValue(error);

    const response = await POST(createRequest({ templateId: "template-id" }), {
      params: Promise.resolve({ caseId: "route-case-id" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("ADMIN_AUTH_REQUIRED");
    expect(mocks.applyDocumentTemplateToCase).not.toHaveBeenCalled();
  });

  it("does not include forbidden fields in the response", async () => {
    const response = await POST(createRequest({ templateId: "template-id" }), {
      params: Promise.resolve({ caseId: "route-case-id" }),
    });
    const payload = JSON.stringify(await response.json());

    expect(payload).not.toContain("internalNote");
    expect(payload).not.toContain("customerInstruction");
    expect(payload).not.toContain("storagePath");
    expect(payload).not.toContain("storageBucket");
    expect(payload).not.toContain("tokenHash");
    expect(payload).not.toContain("plaintextToken");
    expect(payload).not.toContain("signedUrl");
    expect(payload).not.toContain("metadata");
    expect(payload).not.toContain("items");
  });

  it("does not import prisma, portal services, or perform template copy business logic", () => {
    const source = readFileSync(resolve(__dirname, "route.ts"), "utf8");

    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("@prisma/client");
    expect(source).not.toContain("portalServices");
    expect(source).not.toContain("createTimelineEvent");
    expect(source).not.toContain("caseDocumentRequirement");
    expect(source).not.toContain("changeCasePhase");
    expect(source).not.toContain("CustomerAccessToken");
    expect(source).not.toContain("documentTemplateItem");
    expect(source).not.toContain(".create(");
  });
});
