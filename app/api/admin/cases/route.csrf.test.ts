import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createCase: vi.fn(),
  listAdminCases: vi.fn(),
  requireAdminAuth: vi.fn(),
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

import { POST } from "./route";

const csrfToken = "route-csrf-token";

function createPostRequest(headers?: HeadersInit) {
  return new Request("http://localhost/api/admin/cases", {
    method: "POST",
    headers,
    body: JSON.stringify({
      customer: {
        mode: "create",
        name: "Seed Customer",
      },
      applyingVisaType: "Engineer",
    }),
  });
}

describe("POST /api/admin/cases CSRF boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminAuth.mockResolvedValue({
      adminId: "admin-id",
      email: "admin@example.com",
      role: "admin",
    });
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

  it("rejects missing CSRF before calling adminServices", async () => {
    const response = await POST(createPostRequest());
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toEqual({
      error: {
        code: "ADMIN_CSRF_REQUIRED",
        message: "Invalid admin request.",
      },
    });
    expect(mocks.requireAdminAuth).toHaveBeenCalled();
    expect(mocks.createCase).not.toHaveBeenCalled();
  });

  it("allows a matching CSRF cookie/header and then calls adminServices", async () => {
    const response = await POST(
      createPostRequest({
        cookie: `admin_csrf_token=${csrfToken}`,
        "X-CSRF-Token": csrfToken,
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.id).toBe("case-id");
    expect(mocks.createCase).toHaveBeenCalledOnce();
  });

  it("auth failure happens before CSRF validation", async () => {
    const error = new Error("auth required");
    error.name = "AdminAuthRequiredError";
    mocks.requireAdminAuth.mockRejectedValue(error);

    const response = await POST(createPostRequest());
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("ADMIN_AUTH_REQUIRED");
    expect(mocks.createCase).not.toHaveBeenCalled();
  });
});
