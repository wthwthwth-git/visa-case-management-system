import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listAdminCustomers: vi.fn(),
  requireAdminAuth: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  adminServices: {
    listAdminCustomers: mocks.listAdminCustomers,
  },
}));

vi.mock("@/lib/api/admin-auth", () => ({
  requireAdminAuth: mocks.requireAdminAuth,
}));

import { GET } from "./route";

describe("GET /api/admin/customers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminAuth.mockResolvedValue({ adminId: "development-admin" });
    mocks.listAdminCustomers.mockResolvedValue({
      items: [
        {
          id: "customer-id",
          name: "Seed Customer",
          email: "seed.customer@example.com",
          phone: "000-0000",
          nationality: "Test nationality",
          birthday: "1990-01-01T00:00:00.000Z",
          caseCount: 2,
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      page: 2,
      pageSize: 10,
      total: 1,
    });
  });

  it("requires admin auth and passes query params to adminServices", async () => {
    const request = new Request(
      "http://localhost/api/admin/customers?q=seed&page=2&pageSize=10",
    );

    const response = await GET(request);
    const payload = await response.json();

    expect(mocks.requireAdminAuth).toHaveBeenCalledWith(request);
    expect(mocks.listAdminCustomers).toHaveBeenCalledWith({
      q: "seed",
      page: "2",
      pageSize: "10",
    });
    expect(payload).toEqual({
      data: {
        items: [
          {
            id: "customer-id",
            name: "Seed Customer",
            email: "seed.customer@example.com",
            phone: "000-0000",
            nationality: "Test nationality",
            birthday: "1990-01-01T00:00:00.000Z",
            caseCount: 2,
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        page: 2,
        pageSize: 10,
        total: 1,
      },
    });
  });

  it("maps auth failure to ADMIN_AUTH_REQUIRED and does not call service", async () => {
    const error = new Error("auth required");
    error.name = "AdminAuthNotImplementedError";
    mocks.requireAdminAuth.mockRejectedValue(error);

    const response = await GET(new Request("http://localhost/api/admin/customers"));
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("ADMIN_AUTH_REQUIRED");
    expect(mocks.listAdminCustomers).not.toHaveBeenCalled();
  });

  it("does not include sensitive fields in the response", async () => {
    const response = await GET(new Request("http://localhost/api/admin/customers"));
    const payload = JSON.stringify(await response.json());

    expect(payload).not.toContain("passportNumber");
    expect(payload).not.toContain("residenceCardNumber");
    expect(payload).not.toContain("address");
    expect(payload).not.toContain("tokenHash");
    expect(payload).not.toContain("plaintextToken");
    expect(payload).not.toContain("storagePath");
    expect(payload).not.toContain("storageBucket");
    expect(payload).not.toContain("signedUrl");
    expect(payload).not.toContain("_count");
  });

  it("does not import prisma, portal services, or mutation helpers", () => {
    const source = readFileSync(resolve(__dirname, "route.ts"), "utf8");

    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("@prisma/client");
    expect(source).not.toContain("portalServices");
    expect(source).not.toContain(".create(");
    expect(source).not.toContain(".update(");
    expect(source).not.toContain(".delete(");
    expect(source).not.toContain("createCase");
    expect(source).not.toContain("createPortalTokenForCase");
    expect(source).not.toContain("CustomerAccessToken");
  });
});
