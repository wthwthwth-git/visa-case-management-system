import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("next-auth/next", () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock("@/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.findUnique,
    },
  },
}));

import { requireAdminAuth } from "./admin-auth";

describe("requireAdminAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({
      user: {
        id: "admin-user-id",
        email: "admin@example.com",
      },
    });
    mocks.findUnique.mockResolvedValue({
      id: "admin-user-id",
      email: "admin@example.com",
      role: "admin",
      status: "active",
    });
  });

  it("returns admin context from a valid session and active User", async () => {
    await expect(requireAdminAuth(new Request("http://localhost/api/admin/cases"))).resolves.toEqual({
      adminId: "admin-user-id",
      email: "admin@example.com",
      role: "admin",
    });
  });

  it("fails when session is missing", async () => {
    mocks.getServerSession.mockResolvedValue(null);

    await expect(requireAdminAuth(new Request("http://localhost/api/admin/cases"))).rejects.toMatchObject({
      name: "AdminAuthRequiredError",
    });
  });

  it("fails when session email is missing", async () => {
    mocks.getServerSession.mockResolvedValue({
      user: {
        id: "admin-user-id",
      },
    });

    await expect(requireAdminAuth(new Request("http://localhost/api/admin/cases"))).rejects.toMatchObject({
      name: "AdminAuthRequiredError",
    });
  });

  it("fails when User is disabled", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "admin-user-id",
      email: "admin@example.com",
      role: "admin",
      status: "disabled",
    });

    await expect(requireAdminAuth(new Request("http://localhost/api/admin/cases"))).rejects.toMatchObject({
      name: "AdminAccountDisabledError",
    });
  });
});
