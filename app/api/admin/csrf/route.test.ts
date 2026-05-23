import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminAuth: vi.fn(),
  generateAdminCsrfToken: vi.fn(),
}));

vi.mock("@/lib/api/admin-auth", () => ({
  requireAdminAuth: mocks.requireAdminAuth,
}));

vi.mock("@/lib/api/csrf", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/csrf")>();

  return {
    ...actual,
    generateAdminCsrfToken: mocks.generateAdminCsrfToken,
  };
});

import { GET } from "./route";

describe("GET /api/admin/csrf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminAuth.mockResolvedValue({
      adminId: "admin-id",
      email: "admin@example.com",
      role: "admin",
    });
    mocks.generateAdminCsrfToken.mockReturnValue("generated-csrf-token");
  });

  it("requires admin auth and sets a csrf cookie when missing", async () => {
    const request = new Request("http://localhost/api/admin/csrf");
    const response = await GET(request);
    const payload = await response.json();

    expect(mocks.requireAdminAuth).toHaveBeenCalledWith(request);
    expect(payload).toEqual({ data: { ok: true } });
    expect(response.headers.get("set-cookie")).toContain("admin_csrf_token=generated-csrf-token");
    expect(response.headers.get("set-cookie")).not.toContain("HttpOnly");
    expect(JSON.stringify(payload)).not.toContain("generated-csrf-token");
  });

  it("does not rotate an existing csrf cookie", async () => {
    const response = await GET(
      new Request("http://localhost/api/admin/csrf", {
        headers: {
          cookie: "admin_csrf_token=existing-token",
        },
      }),
    );

    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mocks.generateAdminCsrfToken).not.toHaveBeenCalled();
  });

  it("maps auth failure safely", async () => {
    const error = new Error("auth required");
    error.name = "AdminAuthRequiredError";
    mocks.requireAdminAuth.mockRejectedValue(error);

    const response = await GET(new Request("http://localhost/api/admin/csrf"));
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("ADMIN_AUTH_REQUIRED");
  });
});
