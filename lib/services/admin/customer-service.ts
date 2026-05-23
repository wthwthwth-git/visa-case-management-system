import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type AdminCustomerListInput = {
  q?: string;
  page?: string;
  pageSize?: string;
};

export type AdminCustomerListItemDTO = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  birthday: string | null;
  caseCount: number;
  updatedAt: string;
};

export type AdminCustomerListDTO = {
  items: AdminCustomerListItemDTO[];
  page: number;
  pageSize: number;
  total: number;
};

function parsePositiveInt(value: string | undefined, fallback: number, max: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function toAdminCustomerListItemDTO(customer: {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  birthday: Date | null;
  updatedAt: Date;
  _count: {
    cases: number;
  };
}): AdminCustomerListItemDTO {
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    nationality: customer.nationality,
    birthday: customer.birthday?.toISOString() ?? null,
    caseCount: customer._count.cases,
    updatedAt: customer.updatedAt.toISOString(),
  };
}

export async function listAdminCustomers(
  input: AdminCustomerListInput = {},
): Promise<AdminCustomerListDTO> {
  const page = parsePositiveInt(input.page, 1, 10_000);
  const pageSize = parsePositiveInt(input.pageSize, 20, 100);
  const query = input.q?.trim();
  const where: Prisma.CustomerWhereInput = {
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
            { phone: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
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
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.customer.count({ where }),
  ]);

  return {
    items: items.map(toAdminCustomerListItemDTO),
    page,
    pageSize,
    total,
  };
}
