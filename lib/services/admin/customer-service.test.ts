import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    customer: {
      findMany: mocks.findMany,
      count: mocks.count,
      findUnique: mocks.findUnique,
      update: mocks.update,
    },
  },
}));

import {
  AdminCustomerAccessError,
  InvalidAdminCustomerInputError,
  listAdminCustomers,
  updateAdminCustomer,
} from "./customer-service";

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
    mocks.findUnique.mockResolvedValue({ id: "customer-id" });
    mocks.update.mockResolvedValue({
      id: "customer-id",
      name: "Updated Customer",
      email: "updated@example.com",
      phone: "090-0000-0000",
      nationality: "Japan",
      birthday,
      updatedAt,
    });
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

  it("updates customer visible admin fields and returns a safe DTO", async () => {
    const result = await updateAdminCustomer({
      customerId: " customer-id ",
      name: " Updated Customer ",
      email: " updated@example.com ",
      phone: " 090-0000-0000 ",
      nationality: " Japan ",
    });

    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: "customer-id" },
      select: { id: true },
    });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "customer-id" },
      data: {
        name: "Updated Customer",
        email: "updated@example.com",
        phone: "090-0000-0000",
        nationality: "Japan",
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        nationality: true,
        birthday: true,
        updatedAt: true,
      },
    });
    expect(result).toEqual({
      id: "customer-id",
      name: "Updated Customer",
      email: "updated@example.com",
      phone: "090-0000-0000",
      nationality: "Japan",
      birthday: "1990-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(JSON.stringify(result)).not.toContain("passportNumber");
    expect(JSON.stringify(result)).not.toContain("residenceCardNumber");
    expect(JSON.stringify(result)).not.toContain("address");
  });

  it("stores blank optional customer fields as null", async () => {
    await updateAdminCustomer({
      customerId: "customer-id",
      name: "Updated Customer",
      email: " ",
      phone: "",
      nationality: undefined,
    });

    expect(mocks.update.mock.calls[0][0].data).toMatchObject({
      email: null,
      phone: null,
      nationality: null,
    });
  });

  it("rejects missing customer update fields", async () => {
    await expect(
      updateAdminCustomer({
        customerId: "customer-id",
        name: " ",
      }),
    ).rejects.toBeInstanceOf(InvalidAdminCustomerInputError);

    await expect(
      updateAdminCustomer({
        customerId: "",
        name: "Updated Customer",
      }),
    ).rejects.toBeInstanceOf(InvalidAdminCustomerInputError);
  });

  it("fails when customer does not exist", async () => {
    mocks.findUnique.mockResolvedValue(null);

    await expect(
      updateAdminCustomer({
        customerId: "missing-customer-id",
        name: "Updated Customer",
      }),
    ).rejects.toBeInstanceOf(AdminCustomerAccessError);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
