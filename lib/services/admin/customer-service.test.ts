import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    customer: {
      findMany: mocks.findMany,
      count: mocks.count,
    },
  },
}));

import { listAdminCustomers } from "./customer-service";

const updatedAt = new Date("2026-01-01T00:00:00.000Z");
const birthday = new Date("1990-01-01T00:00:00.000Z");

describe("admin customer service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([
      {
        id: "customer-id",
        name: "Seed Customer",
        email: "seed.customer@example.com",
        phone: "000-0000",
        nationality: "Test nationality",
        birthday,
        updatedAt,
        _count: {
          cases: 2,
        },
      },
      {
        id: "customer-id-null-birthday",
        name: "No Birthday",
        email: null,
        phone: null,
        nationality: null,
        birthday: null,
        updatedAt,
        _count: {
          cases: 0,
        },
      },
    ]);
    mocks.count.mockResolvedValue(2);
  });

  it("lists customers with default pagination and DTO mapping", async () => {
    const result = await listAdminCustomers();

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {},
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        nationality: true,
        birthday: true,
        updatedAt: true,
        _count: {
          select: {
            cases: true,
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      skip: 0,
      take: 20,
    });
    expect(mocks.count).toHaveBeenCalledWith({ where: {} });
    expect(result).toEqual({
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
        {
          id: "customer-id-null-birthday",
          name: "No Birthday",
          email: null,
          phone: null,
          nationality: null,
          birthday: null,
          caseCount: 0,
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      page: 1,
      pageSize: 20,
      total: 2,
    });
  });

  it("searches name, email, and phone and clamps pageSize", async () => {
    await listAdminCustomers({
      q: " seed ",
      page: "2",
      pageSize: "500",
    });

    expect(mocks.findMany.mock.calls[0][0]).toMatchObject({
      where: {
        OR: [
          { name: { contains: "seed", mode: "insensitive" } },
          { email: { contains: "seed", mode: "insensitive" } },
          { phone: { contains: "seed", mode: "insensitive" } },
        ],
      },
      skip: 100,
      take: 100,
    });
    expect(mocks.count).toHaveBeenCalledWith({
      where: {
        OR: [
          { name: { contains: "seed", mode: "insensitive" } },
          { email: { contains: "seed", mode: "insensitive" } },
          { phone: { contains: "seed", mode: "insensitive" } },
        ],
      },
    });
  });

  it("falls back for invalid pagination", async () => {
    await listAdminCustomers({
      page: "-1",
      pageSize: "not-a-number",
    });

    expect(mocks.findMany.mock.calls[0][0]).toMatchObject({
      skip: 0,
      take: 20,
    });
  });

  it("does not return passport, residence card, address, token, storage, signed URL, or Prisma internals", async () => {
    const result = await listAdminCustomers();
    const payload = JSON.stringify(result);

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
});
