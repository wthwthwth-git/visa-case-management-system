import { prisma } from "@/lib/prisma";
import type { DocumentTemplateStatus, Prisma, ResponsibleParty } from "@prisma/client";

export type AdminTemplateListInput = {
  q?: string;
  status?: string;
  currentVisaType?: string;
  targetVisaType?: string;
  templateKey?: string;
  page?: string;
  pageSize?: string;
};

export type AdminTemplateListItemDTO = {
  id: string;
  templateKey: string;
  version: number;
  title: string;
  status: DocumentTemplateStatus;
  currentVisaType: string | null;
  targetVisaType: string | null;
  itemCount: number;
  updatedAt: string;
};

export type AdminTemplateListDTO = {
  items: AdminTemplateListItemDTO[];
  page: number;
  pageSize: number;
  total: number;
};

export type AdminTemplateDetailDTO = {
  id: string;
  templateKey: string;
  version: number;
  title: string;
  templateDescription: string | null;
  status: DocumentTemplateStatus;
  currentVisaType: string | null;
  targetVisaType: string | null;
  createdAt: string;
  updatedAt: string;
  items: Array<{
    id: string;
    itemKey: string;
    title: string;
    customerInstruction: string | null;
    internalNote: string | null;
    isRequired: boolean;
    responsibleParty: ResponsibleParty;
    sortOrder: number;
    acceptedFileTypesDescription: string | null;
  }>;
};

const templateStatuses: DocumentTemplateStatus[] = ["draft", "active", "archived"];

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

function parseTemplateStatus(value: string | undefined): DocumentTemplateStatus {
  if (!value) {
    return "active";
  }

  return templateStatuses.includes(value as DocumentTemplateStatus)
    ? (value as DocumentTemplateStatus)
    : "active";
}

function toAdminTemplateListItemDTO(template: {
  id: string;
  templateKey: string;
  version: number;
  title: string;
  status: DocumentTemplateStatus;
  currentVisaType: string | null;
  targetVisaType: string | null;
  updatedAt: Date;
  _count: {
    items: number;
  };
}): AdminTemplateListItemDTO {
  return {
    id: template.id,
    templateKey: template.templateKey,
    version: template.version,
    title: template.title,
    status: template.status,
    currentVisaType: template.currentVisaType,
    targetVisaType: template.targetVisaType,
    itemCount: template._count.items,
    updatedAt: template.updatedAt.toISOString(),
  };
}

function toAdminTemplateDetailDTO(template: {
  id: string;
  templateKey: string;
  version: number;
  title: string;
  templateDescription: string | null;
  status: DocumentTemplateStatus;
  currentVisaType: string | null;
  targetVisaType: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    itemKey: string;
    title: string;
    customerInstruction: string | null;
    internalNote: string | null;
    isRequired: boolean;
    responsibleParty: ResponsibleParty;
    sortOrder: number;
    acceptedFileTypesDescription: string | null;
  }>;
}): AdminTemplateDetailDTO {
  return {
    id: template.id,
    templateKey: template.templateKey,
    version: template.version,
    title: template.title,
    templateDescription: template.templateDescription,
    status: template.status,
    currentVisaType: template.currentVisaType,
    targetVisaType: template.targetVisaType,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
    items: [...template.items]
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((item) => ({
        id: item.id,
        itemKey: item.itemKey,
        title: item.title,
        customerInstruction: item.customerInstruction,
        internalNote: item.internalNote,
        isRequired: item.isRequired,
        responsibleParty: item.responsibleParty,
        sortOrder: item.sortOrder,
        acceptedFileTypesDescription: item.acceptedFileTypesDescription,
      })),
  };
}

export async function listAdminDocumentTemplates(
  input: AdminTemplateListInput = {},
): Promise<AdminTemplateListDTO> {
  const page = parsePositiveInt(input.page, 1, 10_000);
  const pageSize = parsePositiveInt(input.pageSize, 20, 100);
  const status = parseTemplateStatus(input.status);
  const query = input.q?.trim();
  const templateKey = input.templateKey?.trim();
  const currentVisaType = input.currentVisaType?.trim();
  const targetVisaType = input.targetVisaType?.trim();
  const where: Prisma.DocumentTemplateWhereInput = {
    status,
    ...(templateKey ? { templateKey } : {}),
    ...(currentVisaType ? { currentVisaType } : {}),
    ...(targetVisaType ? { targetVisaType } : {}),
    ...(query
      ? {
          OR: [
            { templateKey: { contains: query, mode: "insensitive" } },
            { title: { contains: query, mode: "insensitive" } },
            { templateDescription: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.documentTemplate.findMany({
      where,
      select: {
        id: true,
        templateKey: true,
        version: true,
        title: true,
        status: true,
        currentVisaType: true,
        targetVisaType: true,
        updatedAt: true,
        _count: {
          select: {
            items: true,
          },
        },
      },
      orderBy: [{ templateKey: "asc" }, { version: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.documentTemplate.count({ where }),
  ]);

  return {
    items: items.map(toAdminTemplateListItemDTO),
    page,
    pageSize,
    total,
  };
}

export async function getAdminDocumentTemplateById(
  templateId: string,
): Promise<AdminTemplateDetailDTO | null> {
  const template = await prisma.documentTemplate.findUnique({
    where: { id: templateId },
    select: {
      id: true,
      templateKey: true,
      version: true,
      title: true,
      templateDescription: true,
      status: true,
      currentVisaType: true,
      targetVisaType: true,
      createdAt: true,
      updatedAt: true,
      items: {
        select: {
          id: true,
          itemKey: true,
          title: true,
          customerInstruction: true,
          internalNote: true,
          isRequired: true,
          responsibleParty: true,
          sortOrder: true,
          acceptedFileTypesDescription: true,
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  return template ? toAdminTemplateDetailDTO(template) : null;
}
