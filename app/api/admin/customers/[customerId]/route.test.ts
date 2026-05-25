import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateAdminCustomer: vi.fn(),
  requireAdminAuth: vi.fn(),
  requireAdminCsrf: vi.fn(),
  requireAdminRateLimit: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  adminServices: {
    updateAdminCustomer: mocks.updateAdminCustomer,
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

import { PATCH } from "./route";

describe("PATCH /api/admin/customers/[customerId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminAuth.mockResolvedValue({
      adminId: "admin-id",
      email: "admin@example.com",
    });
    mocks.requireAdminCsrf.mockResolvedValue(undefined);
    mocks.requireAdminRateLimit.mockResolvedValue(undefined);
    mocks.updateAdminCustomer.mockResolvedValue({
      id: "route-customer-id",
      name: "Updated Customer",
      email: "updated@example.com",
      phone: "090-0000-0000",
      nationality: "Japan",
      birthday: null,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("requires auth, csrf, rate limit, and passes only whitelisted fields", async () => {
    const request = new Request("http://localhost/api/admin/customers/route-customer-id", {
      method: "PATCH",
      body: JSON.stringify({
        customerId: "body-customer-id",
        name: "Updated Customer",
        email: "updated@example.com",
        phone: "090-0000-0000",
        nationality: "Japan",
        passportNumber: "do-not-pass",
        residenceCardNumber: "do-not-pass",
        address: "do-not-pass",
        tokenHash: "do-not-pass",
        storagePath: "cases/file.pdf",
      }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ customerId: "route-customer-id" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.requireAdminAuth).toHaveBeenCalledWith(request);
    expect(mocks.requireAdminCsrf).toHaveBeenCalledWith(request);
    expect(mocks.requireAdminRateLimit).toHaveBeenCalledWith(request, {
      adminId: "admin-id",
      email: "admin@example.com",
      routeGroup: "admin_mutation",
    });
    expect(mocks.updateAdminCustomer).toHaveBeenCalledWith({
      customerId: "route-customer-id",
      name: "Updated Customer",
      email: "updated@example.com",
      phone: "090-0000-0000",
      nationality: "Japan",
    });
    expect(JSON.stringify(mocks.updateAdminCustomer.mock.calls[0][0])).not.toContain(
      "body-customer-id",
    );
    expect(JSON.stringify(mocks.updateAdminCustomer.mock.calls[0][0])).not.toContain(
      "passportNumber",
    );
    expect(JSON.stringify(mocks.updateAdminCustomer.mock.calls[0][0])).not.toContain(
      "storagePath",
    );
    expect(payload.data.name).toBe("Updated Customer");
  });

  it("returns INVALID_REQUEST when name is missing", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/admin/customers/route-customer-id", {
        method: "PATCH",
        body: JSON.stringify({
          email: "updated@example.com",
        }),
      }),
      {
        params: Promise.resolve({ customerId: "route-customer-id" }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
    expect(mocks.updateAdminCustomer).not.toHaveBeenCalled();
  });

  it("maps service errors safely", async () => {
    const error = new Error("passportNumber storagePath tokenHash should not leak");
    error.name = "InvalidAdminCustomerInputError";
    mocks.updateAdminCustomer.mockRejectedValue(error);

    const response = await PATCH(
      new Request("http://localhost/api/admin/customers/route-customer-id", {
        method: "PATCH",
        body: JSON.stringify({
          name: "Updated Customer",
        }),
      }),
      {
        params: Promise.resolve({ customerId: "route-customer-id" }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
    expect(JSON.stringify(payload)).not.toContain("passportNumber");
    expect(JSON.stringify(payload)).not.toContain("tokenHash");
    expect(JSON.stringify(payload)).not.toContain("storagePath");
  });

  it("does not import prisma, portal services, storage, or timeline writers", () => {
    const source = readFileSync(resolve(__dirname, "route.ts"), "utf8");

    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("@prisma/client");
    expect(source).not.toContain("portalServices");
    expect(source).not.toContain("storage");
    expect(source).not.toContain("createTimelineEvent");
  });
});
