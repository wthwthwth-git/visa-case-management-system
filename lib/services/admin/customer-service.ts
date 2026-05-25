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

export class InvalidAdminCustomerInputError extends Error {
  constructor(message = "Invalid admin customer input.") {
    super(message);
    this.name = "InvalidAdminCustomerInputError";
  }
}

export class AdminCustomerAccessError extends Error {
  constructor(message = "Admin customer access error.") {
    super(message);
    this.name = "AdminCustomerAccessError";
  }
}

export type AdminCustomerUpdateInput = {
  customerId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  nationality?: string | null;
};

export type AdminCustomerDTO = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  birthday: string | null;
  updatedAt: string;
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

function normalizeRequiredString(value: string | undefined, fieldName: string): string {
  const normalized = value?.trim();

  if (!normalized) {
    throw new InvalidAdminCustomerInputError(`${fieldName} is required.`);
  }

  return normalized;
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
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

function toAdminCustomerDTO(customer: {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  birthday: Date | null;
  updatedAt: Date;
}): AdminCustomerDTO {
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    nationality: customer.nationality,
    birthday: customer.birthday?.toISOString() ?? null,
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

export async function updateAdminCustomer(
  input: AdminCustomerUpdateInput,
): Promise<AdminCustomerDTO> {
  const customerId = normalizeRequiredString(input.customerId, "customerId");
  const name = normalizeRequiredString(input.name, "name");

  const existingCustomer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true },
  });

  if (!existingCustomer) {
    throw new AdminCustomerAccessError();
  }

  const customer = await prisma.customer.update({
    where: { id: customerId },
    data: {
      name,
      email: normalizeOptionalString(input.email),
      phone: normalizeOptionalString(input.phone),
      nationality: normalizeOptionalString(input.nationality),
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

  return toAdminCustomerDTO(customer);
}
