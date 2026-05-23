import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createCaseFromTemplateSelection: vi.fn(),
  requireAdminAuth: vi.fn(),
  requireAdminCsrf: vi.fn(),
  requireAdminRateLimit: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  adminServices: {
    createCaseFromTemplateSelection: mocks.createCaseFromTemplateSelection,
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

import { POST } from "./route";

function createRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/cases/from-template-selection", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    customer: {
      mode: "reuse",
      customerId: "11111111-1111-1111-1111-111111111111",
    },
    existingVisaType: "无",
    applyingVisaType: "技術・人文知識・国際業務",
    title: "Optional title",
    internalNote: "Internal setup note",
    templateId: "22222222-2222-2222-2222-222222222222",
    selectedTemplateItemIds: [
      "33333333-3333-3333-3333-333333333333",
      "44444444-4444-4444-4444-444444444444",
    ],
    customItems: [
      {
        title: "追加資料",
        responsibleParty: "customer",
        customerInstruction: "Please upload this.",
        internalNote: "Admin-only note.",
        dueDate: "2026-02-01T00:00:00.000Z",
        portalVisible: true,
        portalDownloadable: false,
      },
    ],
    ...overrides,
  };
}

describe("POST /api/admin/cases/from-template-selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminAuth.mockResolvedValue({
      adminId: "admin-id",
      email: "admin@example.com",
    });
    mocks.requireAdminCsrf.mockResolvedValue(undefined);
    mocks.requireAdminRateLimit.mockResolvedValue(undefined);
    mocks.createCaseFromTemplateSelection.mockResolvedValue({
      caseId: "case-id",
      customerId: "11111111-1111-1111-1111-111111111111",
      caseNumber: "CASE-20260523-ABC12345",
      currentVisaType: "无",
      targetVisaType: "技術・人文知識・国際業務",
      casePhase: "draft",
      templateId: "22222222-2222-2222-2222-222222222222",
      templateKey: "visa-path-001",
      templateVersion: 1,
      selectedItemCount: 2,
      excludedItemCount: 1,
      customItemCount: 1,
      requirementIds: ["requirement-1", "requirement-2", "requirement-3"],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("runs auth, csrf, rate limit, then calls createCaseFromTemplateSelection with whitelisted fields", async () => {
    const request = createRequest(
      validBody({
        caseId: "attacker-case-id",
        caseNumber: "ATTACKER-CASE",
        casePhase: "approved",
        token: "request-token",
        plaintextToken: "request-plaintext-token",
        tokenHash: "request-token-hash",
        storagePath: "cases/case-id/file.pdf",
        storageBucket: "case-files",
        signedUrl: "https://example.com/signed",
        metadata: { doNotPass: true },
        timeline: "do-not-pass",
        sourceTemplateId: "attacker-source-template",
        sourceTemplateVersion: 99,
        sourceTemplateItemId: "attacker-source-item",
        status: "approved",
        uploadedBy: "attacker",
        file: { name: "attacker.pdf" },
      }),
    );

    const response = await POST(request);
    const payload = await response.json();
    const serviceArg = mocks.createCaseFromTemplateSelection.mock.calls[0][0];

    expect(mocks.requireAdminAuth).toHaveBeenCalledWith(request);
    expect(mocks.requireAdminCsrf).toHaveBeenCalledWith(request);
    expect(mocks.requireAdminRateLimit).toHaveBeenCalledWith(request, {
      adminId: "admin-id",
      email: "admin@example.com",
      routeGroup: "admin_destructive",
    });
    expect(serviceArg).toEqual({
      customer: {
        mode: "reuse",
        customerId: "11111111-1111-1111-1111-111111111111",
      },
      existingVisaType: "无",
      applyingVisaType: "技術・人文知識・国際業務",
      title: "Optional title",
      internalNote: "Internal setup note",
      templateId: "22222222-2222-2222-2222-222222222222",
      selectedTemplateItemIds: [
        "33333333-3333-3333-3333-333333333333",
        "44444444-4444-4444-4444-444444444444",
      ],
      customItems: [
        {
          title: "追加資料",
          responsibleParty: "customer",
          customerInstruction: "Please upload this.",
          internalNote: "Admin-only note.",
          dueDate: new Date("2026-02-01T00:00:00.000Z"),
          portalVisible: true,
          portalDownloadable: false,
        },
      ],
    });
    expect(JSON.stringify(serviceArg)).not.toContain("attacker-case-id");
    expect(JSON.stringify(serviceArg)).not.toContain("request-token-hash");
    expect(JSON.stringify(serviceArg)).not.toContain("storagePath");
    expect(JSON.stringify(serviceArg)).not.toContain("signedUrl");
    expect(JSON.stringify(serviceArg)).not.toContain("sourceTemplateId");
    expect(JSON.stringify(serviceArg)).not.toContain("uploadedBy");
    expect(payload.data).toEqual({
      caseId: "case-id",
      customerId: "11111111-1111-1111-1111-111111111111",
      caseNumber: "CASE-20260523-ABC12345",
      currentVisaType: "无",
      targetVisaType: "技術・人文知識・国際業務",
      casePhase: "draft",
      templateId: "22222222-2222-2222-2222-222222222222",
      templateKey: "visa-path-001",
      templateVersion: 1,
      selectedItemCount: 2,
      excludedItemCount: 1,
      customItemCount: 1,
      requirementIds: ["requirement-1", "requirement-2", "requirement-3"],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("passes customer create fields and converts birthday to Date", async () => {
    await POST(
      createRequest(
        validBody({
          customer: {
            mode: "create",
            name: "New Customer",
            email: "new@example.com",
            phone: "000-0000",
            address: "Test address",
            nationality: "Test nationality",
            birthday: "1990-01-01T00:00:00.000Z",
            passportNumber: "TEST-PASSPORT",
            residenceCardNumber: "TEST-RESIDENCE",
            extra: "do-not-pass",
          },
        }),
      ),
    );

    expect(mocks.createCaseFromTemplateSelection.mock.calls[0][0].customer).toEqual({
      mode: "create",
      name: "New Customer",
      email: "new@example.com",
      phone: "000-0000",
      address: "Test address",
      nationality: "Test nationality",
      birthday: new Date("1990-01-01T00:00:00.000Z"),
      passportNumber: "TEST-PASSPORT",
      residenceCardNumber: "TEST-RESIDENCE",
    });
  });

  it.each([
    ["missing customer", { customer: undefined }],
    ["missing applyingVisaType", { applyingVisaType: undefined }],
    ["missing templateId", { templateId: undefined }],
    ["invalid templateId", { templateId: "bad-template-id" }],
    ["invalid reuse customerId", { customer: { mode: "reuse", customerId: "bad-customer-id" } }],
    ["selected ids not array", { selectedTemplateItemIds: "33333333-3333-3333-3333-333333333333" }],
    [
      "selected ids contain non-string",
      { selectedTemplateItemIds: ["33333333-3333-3333-3333-333333333333", 123] },
    ],
    ["selected ids contain invalid uuid", { selectedTemplateItemIds: ["bad-item-id"] }],
    ["customItems not array", { customItems: "bad" }],
    ["custom title missing", { customItems: [{ responsibleParty: "customer" }] }],
    ["custom responsibleParty invalid", { customItems: [{ title: "Bad", responsibleParty: "admin" }] }],
    ["custom dueDate invalid", { customItems: [{ title: "Bad", responsibleParty: "customer", dueDate: "bad-date" }] }],
    ["custom portalVisible invalid", { customItems: [{ title: "Bad", responsibleParty: "customer", portalVisible: "yes" }] }],
    ["custom portalDownloadable invalid", { customItems: [{ title: "Bad", responsibleParty: "customer", portalDownloadable: "yes" }] }],
  ])("returns INVALID_REQUEST for %s", async (_label, override) => {
    const response = await POST(createRequest(validBody(override)));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
    expect(mocks.createCaseFromTemplateSelection).not.toHaveBeenCalled();
  });

  it.each(["InvalidTemplateSelectionInputError", "TemplateSelectionAccessError"])(
    "maps %s to INVALID_REQUEST",
    async (errorName) => {
      const error = new Error("storagePath tokenHash signedUrl should not leak");
      error.name = errorName;
      mocks.createCaseFromTemplateSelection.mockRejectedValue(error);

      const response = await POST(createRequest(validBody()));
      const payload = await response.json();

      expect(response.status).toBe(400);
      expect(payload.error.code).toBe("INVALID_REQUEST");
      expect(JSON.stringify(payload)).not.toContain("storagePath");
      expect(JSON.stringify(payload)).not.toContain("tokenHash");
      expect(JSON.stringify(payload)).not.toContain("signedUrl");
    },
  );

  it("maps auth failure to ADMIN_AUTH_REQUIRED and does not call csrf, limiter, or service", async () => {
    const error = new Error("auth required");
    error.name = "AdminAuthRequiredError";
    mocks.requireAdminAuth.mockRejectedValue(error);

    const response = await POST(createRequest(validBody()));
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("ADMIN_AUTH_REQUIRED");
    expect(mocks.requireAdminCsrf).not.toHaveBeenCalled();
    expect(mocks.requireAdminRateLimit).not.toHaveBeenCalled();
    expect(mocks.createCaseFromTemplateSelection).not.toHaveBeenCalled();
  });

  it("maps csrf failure to ADMIN_CSRF_REQUIRED and does not call limiter or service", async () => {
    const error = new Error("csrf failure");
    error.name = "AdminCsrfError";
    mocks.requireAdminCsrf.mockRejectedValue(error);

    const response = await POST(createRequest(validBody()));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error.code).toBe("ADMIN_CSRF_REQUIRED");
    expect(mocks.requireAdminRateLimit).not.toHaveBeenCalled();
    expect(mocks.createCaseFromTemplateSelection).not.toHaveBeenCalled();
  });

  it("maps rate limit failure to RATE_LIMITED and does not call service", async () => {
    const error = new Error("rate limited");
    error.name = "RateLimitExceededError";
    Object.assign(error, { retryAfterSeconds: 12 });
    mocks.requireAdminRateLimit.mockRejectedValue(error);

    const response = await POST(createRequest(validBody()));
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("12");
    expect(payload.error.code).toBe("RATE_LIMITED");
    expect(mocks.createCaseFromTemplateSelection).not.toHaveBeenCalled();
  });

  it("does not include forbidden request fields in the response", async () => {
    const response = await POST(
      createRequest(
        validBody({
          tokenHash: "request-token-hash",
          plaintextToken: "request-plaintext-token",
          storagePath: "cases/case-id/file.pdf",
          storageBucket: "case-files",
          signedUrl: "https://example.com/signed",
        }),
      ),
    );
    const payload = JSON.stringify(await response.json());

    expect(payload).not.toContain("request-token-hash");
    expect(payload).not.toContain("request-plaintext-token");
    expect(payload).not.toContain("storagePath");
    expect(payload).not.toContain("storageBucket");
    expect(payload).not.toContain("signedUrl");
  });

  it("does not import prisma, portal services, or perform business writes directly", () => {
    const source = readFileSync(resolve(__dirname, "route.ts"), "utf8");

    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("@prisma/client");
    expect(source).not.toContain("portalServices");
    expect(source).not.toContain("createTimelineEvent");
    expect(source).not.toContain("applyDocumentTemplateToCase");
    expect(source).not.toContain("createPortalToken");
    expect(source).not.toContain("CustomerAccessToken");
    expect(source).not.toContain("caseDocumentRequirement");
    expect(source).not.toContain("documentFile");
    expect(source).not.toContain("storage");
    expect(source).not.toContain(".create(");
  });
});
