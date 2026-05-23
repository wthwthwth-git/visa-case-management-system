import { prisma } from "@/lib/prisma";
import type { CasePhase, Prisma, RequirementStatus } from "@prisma/client";

export type AdminCaseListInput = {
  phase?: string;
  q?: string;
  page?: string;
  pageSize?: string;
};

export type AdminCaseListItemDTO = {
  id: string;
  caseNumber: string;
  customer: {
    id: string;
    name: string;
    email: string | null;
  };
  currentVisaType: string;
  targetVisaType: string;
  casePhase: CasePhase;
  updatedAt: string;
};

export type AdminCaseListDTO = {
  items: AdminCaseListItemDTO[];
  page: number;
  pageSize: number;
  total: number;
};

export type AdminCaseDetailDTO = {
  id: string;
  caseNumber: string;
  currentVisaType: string;
  targetVisaType: string;
  casePhase: CasePhase;
  createdAt: string;
  updatedAt: string;
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    nationality: string | null;
    birthday: string | null;
    passportNumber: string | null;
    residenceCardNumber: string | null;
  };
  requirementSummary: {
    total: number;
    byStatus: Partial<Record<RequirementStatus, number>>;
  };
  applicationConfirmations: Array<{
    id: string;
    title: string;
    version: number;
    status: string;
    confirmedAt: string | null;
    supersededAt: string | null;
  }>;
  tokenSummary: {
    activeTokenCount: number;
  };
};

const casePhases: CasePhase[] = [
  "draft",
  "collecting_documents",
  "preparing_application",
  "submitted",
  "under_review",
  "approved",
];

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

function parseCasePhase(value: string | undefined): CasePhase | undefined {
  if (!value) {
    return undefined;
  }

  return casePhases.includes(value as CasePhase) ? (value as CasePhase) : undefined;
}

function toAdminCaseListItemDTO(visaCase: {
  id: string;
  caseNumber: string;
  currentVisaType: string;
  targetVisaType: string;
  casePhase: CasePhase;
  updatedAt: Date;
  customer: {
    id: string;
    name: string;
    email: string | null;
  };
}): AdminCaseListItemDTO {
  return {
    id: visaCase.id,
    caseNumber: visaCase.caseNumber,
    customer: {
      id: visaCase.customer.id,
      name: visaCase.customer.name,
      email: visaCase.customer.email,
    },
    currentVisaType: visaCase.currentVisaType,
    targetVisaType: visaCase.targetVisaType,
    casePhase: visaCase.casePhase,
    updatedAt: visaCase.updatedAt.toISOString(),
  };
}

function toAdminCaseDetailDTO(visaCase: {
  id: string;
  caseNumber: string;
  currentVisaType: string;
  targetVisaType: string;
  casePhase: CasePhase;
  createdAt: Date;
  updatedAt: Date;
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    nationality: string | null;
    birthday: Date | null;
    passportNumber: string | null;
    residenceCardNumber: string | null;
  };
  documentRequirements: Array<{
    status: RequirementStatus;
  }>;
  applicationConfirmations: Array<{
    id: string;
    title: string;
    version: number;
    status: string;
    confirmedAt: Date | null;
    supersededAt: Date | null;
  }>;
  accessTokens: Array<{
    id: string;
  }>;
}): AdminCaseDetailDTO {
  const byStatus = visaCase.documentRequirements.reduce<Partial<Record<RequirementStatus, number>>>(
    (accumulator, requirement) => {
      accumulator[requirement.status] = (accumulator[requirement.status] ?? 0) + 1;
      return accumulator;
    },
    {},
  );

  return {
    id: visaCase.id,
    caseNumber: visaCase.caseNumber,
    currentVisaType: visaCase.currentVisaType,
    targetVisaType: visaCase.targetVisaType,
    casePhase: visaCase.casePhase,
    createdAt: visaCase.createdAt.toISOString(),
    updatedAt: visaCase.updatedAt.toISOString(),
    customer: {
      id: visaCase.customer.id,
      name: visaCase.customer.name,
      email: visaCase.customer.email,
      phone: visaCase.customer.phone,
      address: visaCase.customer.address,
      nationality: visaCase.customer.nationality,
      birthday: visaCase.customer.birthday?.toISOString() ?? null,
      passportNumber: visaCase.customer.passportNumber,
      residenceCardNumber: visaCase.customer.residenceCardNumber,
    },
    requirementSummary: {
      total: visaCase.documentRequirements.length,
      byStatus,
    },
    applicationConfirmations: visaCase.applicationConfirmations.map((confirmation) => ({
      id: confirmation.id,
      title: confirmation.title,
      version: confirmation.version,
      status: confirmation.status,
      confirmedAt: confirmation.confirmedAt?.toISOString() ?? null,
      supersededAt: confirmation.supersededAt?.toISOString() ?? null,
    })),
    tokenSummary: {
      activeTokenCount: visaCase.accessTokens.length,
    },
  };
}

export async function listAdminCases(input: AdminCaseListInput = {}): Promise<AdminCaseListDTO> {
  const page = parsePositiveInt(input.page, 1, 10_000);
  const pageSize = parsePositiveInt(input.pageSize, 20, 100);
  const phase = parseCasePhase(input.phase);
  const query = input.q?.trim();
  const where: Prisma.CaseWhereInput = {
    ...(phase === undefined ? {} : { casePhase: phase }),
    ...(query
      ? {
          customer: { name: { contains: query, mode: "insensitive" } },
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.case.findMany({
      where,
      select: {
        id: true,
        caseNumber: true,
        currentVisaType: true,
        targetVisaType: true,
        casePhase: true,
        updatedAt: true,
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.case.count({ where }),
  ]);

  return {
    items: items.map(toAdminCaseListItemDTO),
    page,
    pageSize,
    total,
  };
}

export async function getAdminCaseById(caseId: string): Promise<AdminCaseDetailDTO | null> {
  const visaCase = await prisma.case.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      caseNumber: true,
      currentVisaType: true,
      targetVisaType: true,
      casePhase: true,
      createdAt: true,
      updatedAt: true,
      customer: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          address: true,
          nationality: true,
          birthday: true,
          passportNumber: true,
          residenceCardNumber: true,
        },
      },
      documentRequirements: {
        select: {
          status: true,
        },
      },
      applicationConfirmations: {
        select: {
          id: true,
          title: true,
          version: true,
          status: true,
          confirmedAt: true,
          supersededAt: true,
        },
        orderBy: [{ title: "asc" }, { version: "desc" }],
      },
      accessTokens: {
        where: {
          status: "active",
        },
        select: {
          id: true,
        },
      },
    },
  });

  return visaCase ? toAdminCaseDetailDTO(visaCase) : null;
}
