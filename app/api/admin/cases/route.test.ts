import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createCase: vi.fn(),
  listAdminCases: vi.fn(),
  requireAdminAuth: vi.fn(),
  requireAdminCsrf: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  adminServices: {
    createCase: mocks.createCase,
    listAdminCases: mocks.listAdminCases,
  },
}));

vi.mock("@/lib/api/admin-auth", () => ({
  requireAdminAuth: mocks.requireAdminAuth,
}));

vi.mock("@/lib/api/csrf", () => ({
  requireAdminCsrf: mocks.requireAdminCsrf,
}));

import { GET, POST } from "./route";

function createPostRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/cases", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("GET /api/admin/cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminAuth.mockResolvedValue({ adminId: "development-admin" });
    mocks.requireAdminCsrf.mockResolvedValue(undefined);
    mocks.listAdminCases.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });
  });

  it("requires admin auth and calls adminServices with query params", async () => {
    const request = new Request(
      "http://localhost/api/admin/cases?phase=draft&q=seed&page=2&pageSize=10",
    );
    const response = await GET(request);
    const payload = await response.json();

    expect(mocks.requireAdminAuth).toHaveBeenCalledWith(request);
    expect(mocks.listAdminCases).toHaveBeenCalledWith({
      phase: "draft",
      q: "seed",
      page: "2",
      pageSize: "10",
    });
    expect(payload).toEqual({
      data: {
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      },
    });
  });

  it("maps auth errors through safe error responses", async () => {
    const error = new Error("not production auth");
    error.name = "AdminAuthNotImplementedError";
    mocks.requireAdminAuth.mockRejectedValue(error);

    const response = await GET(new Request("http://localhost/api/admin/cases"));
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("ADMIN_AUTH_REQUIRED");
    expect(mocks.listAdminCases).not.toHaveBeenCalled();
  });

  it("does not import prisma or portal services", () => {
    const source = readFileSync(resolve(__dirname, "route.ts"), "utf8");

    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("portalServices");
  });
});

describe("POST /api/admin/cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminAuth.mockResolvedValue({ adminId: "development-admin" });
    mocks.requireAdminCsrf.mockResolvedValue(undefined);
    mocks.createCase.mockResolvedValue({
      id: "case-id",
      customerId: "customer-id",
      caseNumber: "CASE-20260521-ABC12345",
      currentVisaType: "Student",
      targetVisaType: "Engineer",
      casePhase: "draft",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("requires admin auth and calls createCase for customer create mode with whitelisted fields only", async () => {
    const request = createPostRequest({
      customer: {
        mode: "create",
        name: "Seed Customer",
        email: "seed.customer@example.com",
        phone: "000-0000",
        address: "Test address",
        nationality: "Test nationality",
        birthday: "1990-01-01T00:00:00.000Z",
        passportNumber: "TEST-PASSPORT",
        residenceCardNumber: "TEST-RESIDENCE",
        extra: "do-not-pass",
      },
      existingVisaType: "Student",
      applyingVisaType: "Engineer",
      internalNote: "Internal onboarding note",
      caseId: "body-case-id",
      caseNumber: "BODY-CASE-NUMBER",
      casePhase: "approved",
      templateId: "template-id",
      token: "token",
      tokenHash: "tokenHash",
      plaintextToken: "plaintextToken",
      requirements: [{ id: "requirement-id" }],
      files: [{ id: "file-id" }],
      storagePath: "cases/case-id/file.pdf",
      storageBucket: "case-files",
      signedUrl: "https://example.com/signed",
      metadata: { doNotPass: true },
      timeline: "do-not-pass",
      actorId: "operator-id",
      actorType: "internal",
    });

    const response = await POST(request);
    const payload = await response.json();
    const serviceArg = mocks.createCase.mock.calls[0][0];

    expect(mocks.requireAdminAuth).toHaveBeenCalledWith(request);
    expect(serviceArg).toEqual({
      customer: {
        mode: "create",
        name: "Seed Customer",
        email: "seed.customer@example.com",
        phone: "000-0000",
        address: "Test address",
        nationality: "Test nationality",
        birthday: new Date("1990-01-01T00:00:00.000Z"),
        passportNumber: "TEST-PASSPORT",
        residenceCardNumber: "TEST-RESIDENCE",
      },
      existingVisaType: "Student",
      applyingVisaType: "Engineer",
      internalNote: "Internal onboarding note",
    });
    expect(JSON.stringify(serviceArg)).not.toContain("do-not-pass");
    expect(JSON.stringify(serviceArg)).not.toContain("BODY-CASE-NUMBER");
    expect(JSON.stringify(serviceArg)).not.toContain("template-id");
    expect(JSON.stringify(serviceArg)).not.toContain("tokenHash");
    expect(JSON.stringify(serviceArg)).not.toContain("storagePath");
    expect(JSON.stringify(serviceArg)).not.toContain("signedUrl");
    expect(payload.data).toEqual({
      id: "case-id",
      customerId: "customer-id",
      caseNumber: "CASE-20260521-ABC12345",
      currentVisaType: "Student",
      targetVisaType: "Engineer",
      casePhase: "draft",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("calls createCase for customer reuse mode", async () => {
    await POST(
      createPostRequest({
        customer: {
          mode: "reuse",
          customerId: "existing-customer-id",
          name: "do-not-pass",
          passportNumber: "do-not-pass",
        },
        existingVisaType: "Student",
        applyingVisaType: "Engineer",
      }),
    );

    expect(mocks.createCase).toHaveBeenCalledWith({
      customer: {
        mode: "reuse",
        customerId: "existing-customer-id",
      },
      existingVisaType: "Student",
      applyingVisaType: "Engineer",
      internalNote: undefined,
    });
  });

  it("returns INVALID_REQUEST for invalid birthday", async () => {
    const response = await POST(
      createPostRequest({
        customer: {
          mode: "create",
          name: "Seed Customer",
          birthday: "not-a-date",
        },
        applyingVisaType: "Engineer",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
    expect(mocks.createCase).not.toHaveBeenCalled();
  });

  it.each([
    ["missing customer", { applyingVisaType: "Engineer" }],
    ["invalid customer mode", { customer: { mode: "other" }, applyingVisaType: "Engineer" }],
    ["missing applyingVisaType", { customer: { mode: "create", name: "Seed Customer" } }],
    ["missing create name", { customer: { mode: "create" }, applyingVisaType: "Engineer" }],
    ["missing reuse customerId", { customer: { mode: "reuse" }, applyingVisaType: "Engineer" }],
  ])("returns INVALID_REQUEST for %s", async (_label, body) => {
    const response = await POST(createPostRequest(body));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
    expect(mocks.createCase).not.toHaveBeenCalled();
  });

  it("maps create case errors to INVALID_REQUEST", async () => {
    const error = new Error("passportNumber and tokenHash must not leak");
    error.name = "InvalidCaseCreateInputError";
    mocks.createCase.mockRejectedValue(error);

    const response = await POST(
      createPostRequest({
        customer: {
          mode: "create",
          name: "Seed Customer",
        },
        applyingVisaType: "Engineer",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
    expect(JSON.stringify(payload)).not.toContain("passportNumber");
    expect(JSON.stringify(payload)).not.toContain("tokenHash");
  });

  it("maps auth failure to ADMIN_AUTH_REQUIRED and does not call service", async () => {
    const error = new Error("auth required");
    error.name = "AdminAuthNotImplementedError";
    mocks.requireAdminAuth.mockRejectedValue(error);

    const response = await POST(createPostRequest({}));
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("ADMIN_AUTH_REQUIRED");
    expect(mocks.createCase).not.toHaveBeenCalled();
  });

  it("does not include forbidden fields in the response", async () => {
    const response = await POST(
      createPostRequest({
        customer: {
          mode: "create",
          name: "Seed Customer",
          passportNumber: "TEST-PASSPORT",
          residenceCardNumber: "TEST-RESIDENCE",
        },
        applyingVisaType: "Engineer",
        internalNote: "Internal onboarding note",
        tokenHash: "request-token-hash",
        storagePath: "cases/case-id/file.pdf",
        signedUrl: "https://example.com/signed",
      }),
    );
    const payload = JSON.stringify(await response.json());

    expect(payload).not.toContain("passportNumber");
    expect(payload).not.toContain("residenceCardNumber");
    expect(payload).not.toContain("tokenHash");
    expect(payload).not.toContain("plaintextToken");
    expect(payload).not.toContain("storagePath");
    expect(payload).not.toContain("storageBucket");
    expect(payload).not.toContain("signedUrl");
    expect(payload).not.toContain("internalNote");
    expect(payload).not.toContain("documentRequirements");
    expect(payload).not.toContain("accessTokens");
  });

  it("does not import prisma, portal services, or perform business-side writes", () => {
    const source = readFileSync(resolve(__dirname, "route.ts"), "utf8");

    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("@prisma/client");
    expect(source).not.toContain("portalServices");
    expect(source).not.toContain("createTimelineEvent");
    expect(source).not.toContain("applyDocumentTemplateToCase");
    expect(source).not.toContain("CustomerAccessToken");
    expect(source).not.toContain("caseDocumentRequirement");
    expect(source).not.toContain("customer.create");
    expect(source).not.toContain("case.create");
  });
});
