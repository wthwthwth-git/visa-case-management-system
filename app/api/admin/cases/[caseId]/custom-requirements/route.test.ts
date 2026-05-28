import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  requireAdminAuth: vi.fn(),
  requireAdminCsrf: vi.fn(),
  requireAdminRateLimit: vi.fn(),
  addCustomRequirement: vi.fn(),
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

vi.mock("@/lib/services", () => ({
  adminServices: {
    addCustomRequirement: mocks.addCustomRequirement,
  },
}));

function createRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/cases/case-1/custom-requirements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("admin custom requirement route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminAuth.mockResolvedValue({ adminId: "admin-1", email: "admin@example.com" });
    mocks.addCustomRequirement.mockResolvedValue({
      id: "requirement-1",
      caseId: "case-route",
      title: "Custom item",
      responsibleParty: "customer",
      sourceType: "custom",
      status: "not_submitted",
      portalVisible: true,
      portalDownloadable: false,
      customerInstruction: "Please upload.",
      dueDate: "2026-06-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("calls addCustomRequirement with route caseId and whitelisted fields", async () => {
    const response = await POST(
      createRequest({
        title: "Custom item",
        responsibleParty: "customer",
        customerInstruction: "Please upload.",
        dueDate: "2026-06-01",
        sourceType: "template",
        tokenHash: "ignored",
        storagePath: "ignored",
      }),
      { params: Promise.resolve({ caseId: "case-route" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.requireAdminAuth).toHaveBeenCalled();
    expect(mocks.requireAdminCsrf).toHaveBeenCalled();
    expect(mocks.requireAdminRateLimit).toHaveBeenCalledWith(expect.any(Request), {
      adminId: "admin-1",
      email: "admin@example.com",
      routeGroup: "admin_destructive",
    });
    expect(mocks.addCustomRequirement).toHaveBeenCalledWith({
      caseId: "case-route",
      title: "Custom item",
      responsibleParty: "customer",
      customerInstruction: "Please upload.",
      dueDate: new Date("2026-06-01T00:00:00.000Z"),
    });
    expect(JSON.stringify(mocks.addCustomRequirement.mock.calls[0][0])).not.toContain("tokenHash");
    expect(JSON.stringify(mocks.addCustomRequirement.mock.calls[0][0])).not.toContain(
      "storagePath",
    );
  });

  it("rejects invalid body", async () => {
    const response = await POST(createRequest({ title: "", responsibleParty: "admin" }), {
      params: Promise.resolve({ caseId: "case-route" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
    expect(mocks.addCustomRequirement).not.toHaveBeenCalled();
  });

  it("returns INVALID_REQUEST for invalid dueDate", async () => {
    const response = await POST(
      createRequest({
        title: "Custom item",
        responsibleParty: "customer",
        dueDate: "2026-02-30",
      }),
      { params: Promise.resolve({ caseId: "case-route" }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
    expect(mocks.addCustomRequirement).not.toHaveBeenCalled();
  });
});
