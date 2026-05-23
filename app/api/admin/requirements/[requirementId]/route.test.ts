import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE } from "./route";

const mocks = vi.hoisted(() => ({
  requireAdminAuth: vi.fn(),
  requireAdminCsrf: vi.fn(),
  requireAdminRateLimit: vi.fn(),
  removeAdminCaseDocumentRequirement: vi.fn(),
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
    removeAdminCaseDocumentRequirement: mocks.removeAdminCaseDocumentRequirement,
  },
}));

function createRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/requirements/requirement-1", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("admin requirement delete route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires auth, csrf, rate limit and calls delete service with route requirementId", async () => {
    mocks.requireAdminAuth.mockResolvedValue({ adminId: "admin-1", email: "admin@example.com" });
    mocks.removeAdminCaseDocumentRequirement.mockResolvedValue({
      requirementId: "requirement-route",
      removedFileCount: 2,
    });

    const response = await DELETE(
      createRequest({
        caseId: "case-1",
        requirementId: "body-requirement",
        storagePath: "ignored",
        tokenHash: "ignored",
      }),
      { params: Promise.resolve({ requirementId: "requirement-route" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.requireAdminAuth).toHaveBeenCalled();
    expect(mocks.requireAdminCsrf).toHaveBeenCalled();
    expect(mocks.requireAdminRateLimit).toHaveBeenCalledWith(expect.any(Request), {
      adminId: "admin-1",
      email: "admin@example.com",
      routeGroup: "admin_destructive",
    });
    expect(mocks.removeAdminCaseDocumentRequirement).toHaveBeenCalledWith({
      caseId: "case-1",
      requirementId: "requirement-route",
    });
    expect(JSON.stringify(mocks.removeAdminCaseDocumentRequirement.mock.calls[0][0])).not.toContain(
      "storagePath",
    );
    expect(JSON.stringify(mocks.removeAdminCaseDocumentRequirement.mock.calls[0][0])).not.toContain(
      "tokenHash",
    );
  });

  it("returns invalid request when caseId is missing", async () => {
    mocks.requireAdminAuth.mockResolvedValue({ adminId: "admin-1", email: "admin@example.com" });

    const response = await DELETE(createRequest({}), {
      params: Promise.resolve({ requirementId: "requirement-route" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
    expect(mocks.removeAdminCaseDocumentRequirement).not.toHaveBeenCalled();
  });

  it("maps service errors safely", async () => {
    mocks.requireAdminAuth.mockResolvedValue({ adminId: "admin-1", email: "admin@example.com" });
    const error = new Error("cannot delete");
    error.name = "RequirementDeleteAccessError";
    mocks.removeAdminCaseDocumentRequirement.mockRejectedValue(error);

    const response = await DELETE(createRequest({ caseId: "case-1" }), {
      params: Promise.resolve({ requirementId: "requirement-route" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
  });
});
