import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { CasePhase, ResponsibleParty } from "@prisma/client";
import { createTimelineEvent } from "../shared/timeline";

const defaultCurrentVisaType = "unspecified";
const maxCaseNumberAttempts = 5;

export type PreviewCaseTemplateRequirementsInput = {
  templateId: string;
};

export type AdminTemplateRequirementPreviewDTO = {
  template: {
    id: string;
    templateKey: string;
    version: number;
    title: string;
    currentVisaType: string | null;
    targetVisaType: string | null;
  };
  items: Array<{
    sourceTemplateItemId: string;
    itemKey: string;
    title: string;
    responsibleParty: ResponsibleParty;
    customerInstruction: string | null;
    internalNote: string | null;
    isRequired: boolean;
    sortOrder: number;
    defaultSelected: true;
  }>;
};

export type CreateCaseFromTemplateSelectionInput = {
  customer:
    | {
        mode: "create";
        name: string;
        email?: string;
        phone?: string;
        address?: string;
        nationality?: string;
        birthday?: Date;
        passportNumber?: string;
        residenceCardNumber?: string;
      }
    | {
        mode: "reuse";
        customerId: string;
      };
  existingVisaType?: string;
  applyingVisaType: string;
  title?: string;
  internalNote?: string;
  templateId: string;
  selectedTemplateItemIds: string[];
  customItems?: Array<{
    title: string;
    responsibleParty: ResponsibleParty;
    customerInstruction?: string;
    internalNote?: string;
    dueDate?: Date;
    portalVisible?: boolean;
    portalDownloadable?: boolean;
  }>;
};

export type AdminCaseFromTemplateSelectionDTO = {
  caseId: string;
  customerId: string;
  caseNumber: string;
  currentVisaType: string;
  targetVisaType: string;
  casePhase: CasePhase;
  templateId: string;
  templateKey: string;
  templateVersion: number;
  selectedItemCount: number;
  excludedItemCount: number;
  customItemCount: number;
  requirementIds: string[];
  createdAt: string;
  updatedAt: string;
};

export class TemplateSelectionAccessError extends Error {
  constructor(message = "Template selection cannot be used.") {
    super(message);
    this.name = "TemplateSelectionAccessError";
  }
}

export class InvalidTemplateSelectionInputError extends Error {
  constructor(message = "Template selection input is invalid.") {
    super(message);
    this.name = "InvalidTemplateSelectionInputError";
  }
}

type TemplateForSelection = {
  id: string;
  templateKey: string;
  version: number;
  title: string;
  currentVisaType: string | null;
  targetVisaType: string | null;
  status: string;
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

type NormalizedCustomItem = {
  title: string;
  responsibleParty: ResponsibleParty;
  customerInstruction?: string;
  internalNote?: string;
  dueDate?: Date;
  portalVisible: boolean;
  portalDownloadable: boolean;
};

function normalizeRequiredText(value: string | undefined, fieldName: string) {
  const normalized = value?.trim();

  if (!normalized) {
    throw new InvalidTemplateSelectionInputError(`${fieldName} is required.`);
  }

  return normalized;
}

function normalizeOptionalText(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeOptionalDate(value: Date | undefined, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }

  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new InvalidTemplateSelectionInputError(`${fieldName} is invalid.`);
  }

  return value;
}

function normalizeResponsibleParty(value: ResponsibleParty): ResponsibleParty {
  if (value !== "customer" && value !== "office") {
    throw new InvalidTemplateSelectionInputError("responsibleParty is invalid.");
  }

  return value;
}

function resolveDefaultPortalVisible(responsibleParty: ResponsibleParty) {
  return responsibleParty === "customer";
}

function resolvePortalVisibility(input: {
  responsibleParty: ResponsibleParty;
  portalVisible?: boolean;
  portalDownloadable?: boolean;
}) {
  const portalDownloadable = input.portalDownloadable ?? false;
  const portalVisible = portalDownloadable
    ? true
    : (input.portalVisible ?? resolveDefaultPortalVisible(input.responsibleParty));

  return {
    portalVisible,
    portalDownloadable,
  };
}

function normalizeSelectedTemplateItemIds(value: string[]) {
  if (!Array.isArray(value)) {
    throw new InvalidTemplateSelectionInputError("selectedTemplateItemIds is required.");
  }

  const normalized = value.map((itemId) => normalizeRequiredText(itemId, "selectedTemplateItemId"));
  const unique = new Set(normalized);

  if (unique.size !== normalized.length) {
    throw new InvalidTemplateSelectionInputError("selectedTemplateItemIds contains duplicates.");
  }

  return normalized;
}

function normalizeCustomItems(
  customItems: CreateCaseFromTemplateSelectionInput["customItems"],
): NormalizedCustomItem[] {
  return (customItems ?? []).map((item) => {
    const responsibleParty = normalizeResponsibleParty(item.responsibleParty);
    const visibility = resolvePortalVisibility({
      responsibleParty,
      portalVisible: item.portalVisible,
      portalDownloadable: item.portalDownloadable,
    });

    return {
      title: normalizeRequiredText(item.title, "custom item title"),
      responsibleParty,
      customerInstruction: normalizeOptionalText(item.customerInstruction),
      internalNote: normalizeOptionalText(item.internalNote),
      dueDate: normalizeOptionalDate(item.dueDate, "custom item dueDate"),
      ...visibility,
    };
  });
}

function generateCaseNumber(now = new Date()) {
  const datePart = now.toISOString().slice(0, 10).replaceAll("-", "");
  const shortCode = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();

  return `CASE-${datePart}-${shortCode}`;
}

function isUniqueCaseNumberError(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const maybePrismaError = error as { code?: unknown; meta?: { target?: unknown } };

  if (maybePrismaError.code !== "P2002") {
    return false;
  }

  const target = maybePrismaError.meta?.target;

  return Array.isArray(target) && target.includes("caseNumber");
}

function toPreviewDTO(template: TemplateForSelection): AdminTemplateRequirementPreviewDTO {
  return {
    template: {
      id: template.id,
      templateKey: template.templateKey,
      version: template.version,
      title: template.title,
      currentVisaType: template.currentVisaType,
      targetVisaType: template.targetVisaType,
    },
    items: [...template.items]
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((item) => ({
        sourceTemplateItemId: item.id,
        itemKey: item.itemKey,
        title: item.title,
        responsibleParty: item.responsibleParty,
        customerInstruction: item.customerInstruction,
        internalNote: item.internalNote,
        isRequired: item.isRequired,
        sortOrder: item.sortOrder,
        defaultSelected: true,
      })),
  };
}

export async function previewCaseTemplateRequirements(
  input: PreviewCaseTemplateRequirementsInput,
): Promise<AdminTemplateRequirementPreviewDTO> {
  const templateId = normalizeRequiredText(input.templateId, "templateId");
  const template = await prisma.documentTemplate.findUnique({
    where: { id: templateId },
    select: {
      id: true,
      templateKey: true,
      version: true,
      title: true,
      currentVisaType: true,
      targetVisaType: true,
      status: true,
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

  if (!template || template.status !== "active") {
    throw new TemplateSelectionAccessError("Template does not exist or is not active.");
  }

  return toPreviewDTO(template);
}

async function createCaseFromTemplateSelectionOnce(input: {
  customer:
    | {
        mode: "create";
        name: string;
        email?: string;
        phone?: string;
        address?: string;
        nationality?: string;
        birthday?: Date;
        passportNumber?: string;
        residenceCardNumber?: string;
      }
    | {
        mode: "reuse";
        customerId: string;
      };
  currentVisaType: string;
  targetVisaType: string;
  internalNote?: string;
  templateId: string;
  selectedTemplateItemIds: string[];
  customItems: NormalizedCustomItem[];
}): Promise<AdminCaseFromTemplateSelectionDTO> {
  return prisma.$transaction(async (tx) => {
    const customer =
      input.customer.mode === "create"
        ? await tx.customer.create({
            data: {
              name: input.customer.name,
              email: input.customer.email,
              phone: input.customer.phone,
              address: input.customer.address,
              nationality: input.customer.nationality,
              birthday: input.customer.birthday,
              passportNumber: input.customer.passportNumber,
              residenceCardNumber: input.customer.residenceCardNumber,
            },
            select: { id: true },
          })
        : await tx.customer.findUnique({
            where: { id: input.customer.customerId },
            select: { id: true },
          });

    if (!customer) {
      throw new TemplateSelectionAccessError("Customer does not exist.");
    }

    const template = await tx.documentTemplate.findUnique({
      where: { id: input.templateId },
      select: {
        id: true,
        templateKey: true,
        version: true,
        title: true,
        currentVisaType: true,
        targetVisaType: true,
        status: true,
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

    if (!template || template.status !== "active") {
      throw new TemplateSelectionAccessError("Template does not exist or is not active.");
    }

    const itemsById = new Map(template.items.map((item) => [item.id, item]));
    const missingItemIds = input.selectedTemplateItemIds.filter((itemId) => !itemsById.has(itemId));

    if (missingItemIds.length > 0) {
      throw new TemplateSelectionAccessError("Selected template item does not belong to template.");
    }

    if (input.selectedTemplateItemIds.length === 0 && input.customItems.length === 0) {
      throw new InvalidTemplateSelectionInputError(
        "At least one template or custom requirement is required.",
      );
    }

    const selectedTemplateItems = input.selectedTemplateItemIds
      .map((itemId) => itemsById.get(itemId))
      .filter((item): item is NonNullable<typeof item> => item !== undefined)
      .sort((left, right) => left.sortOrder - right.sortOrder);
    const createdCase = await tx.case.create({
      data: {
        customerId: customer.id,
        caseNumber: generateCaseNumber(),
        currentVisaType: input.currentVisaType,
        targetVisaType: input.targetVisaType,
        casePhase: "draft",
      },
    });
    const createdRequirementIds: string[] = [];

    await createTimelineEvent(
      {
        caseId: createdCase.id,
        eventType: "case_created",
        actorType: "internal",
        summary: "Case created.",
        targetType: "case",
        targetId: createdCase.id,
        metadata: {
          caseId: createdCase.id,
        },
      },
      tx,
    );

    if (input.internalNote) {
      await tx.internalNote.create({
        data: {
          caseId: createdCase.id,
          targetType: "case",
          targetId: createdCase.id,
          body: input.internalNote,
        },
        select: { id: true },
      });
    }

    for (const item of selectedTemplateItems) {
      const requirement = await tx.caseDocumentRequirement.create({
        data: {
          caseId: createdCase.id,
          title: item.title,
          customerInstruction: item.customerInstruction,
          internalNote: null,
          isRequired: item.isRequired,
          responsibleParty: item.responsibleParty,
          sourceType: "template",
          status: "not_submitted",
          sortOrder: item.sortOrder,
          acceptedFileTypesDescription: item.acceptedFileTypesDescription,
          portalVisible: resolveDefaultPortalVisible(item.responsibleParty),
          portalDownloadable: false,
          sourceTemplateId: template.id,
          sourceTemplateVersion: template.version,
          sourceTemplateItemId: item.id,
        },
        select: { id: true },
      });

      createdRequirementIds.push(requirement.id);
    }

    for (const [index, item] of input.customItems.entries()) {
      const requirement = await tx.caseDocumentRequirement.create({
        data: {
          caseId: createdCase.id,
          title: item.title,
          customerInstruction: item.customerInstruction,
          internalNote: item.internalNote,
          isRequired: true,
          responsibleParty: item.responsibleParty,
          sourceType: "custom",
          status: "not_submitted",
          sortOrder: 10_000 + index,
          portalVisible: item.portalVisible,
          portalDownloadable: item.portalDownloadable,
          dueDate: item.dueDate,
          sourceTemplateId: null,
          sourceTemplateVersion: null,
          sourceTemplateItemId: null,
        },
        select: { id: true },
      });

      createdRequirementIds.push(requirement.id);
    }

    const selectedItemCount = selectedTemplateItems.length;
    const excludedItemCount = template.items.length - selectedItemCount;
    const customItemCount = input.customItems.length;

    await createTimelineEvent(
      {
        caseId: createdCase.id,
        eventType: "template_items_copied",
        actorType: "internal",
        summary: "Selected template items copied.",
        targetType: "document_template",
        targetId: template.id,
        metadata: {
          caseId: createdCase.id,
          templateId: template.id,
          templateKey: template.templateKey,
          templateVersion: template.version,
          selectedItemCount,
          excludedItemCount,
          customItemCount,
        },
      },
      tx,
    );

    if (customItemCount > 0) {
      await createTimelineEvent(
        {
          caseId: createdCase.id,
          eventType: "requirement_created",
          actorType: "internal",
          summary: "Custom requirements created.",
          targetType: "case",
          targetId: createdCase.id,
          metadata: {
            caseId: createdCase.id,
            templateId: template.id,
            templateKey: template.templateKey,
            templateVersion: template.version,
            selectedItemCount,
            excludedItemCount,
            customItemCount,
          },
        },
        tx,
      );
    }

    return {
      caseId: createdCase.id,
      customerId: customer.id,
      caseNumber: createdCase.caseNumber,
      currentVisaType: createdCase.currentVisaType,
      targetVisaType: createdCase.targetVisaType,
      casePhase: createdCase.casePhase,
      templateId: template.id,
      templateKey: template.templateKey,
      templateVersion: template.version,
      selectedItemCount,
      excludedItemCount,
      customItemCount,
      requirementIds: createdRequirementIds,
      createdAt: createdCase.createdAt.toISOString(),
      updatedAt: createdCase.updatedAt.toISOString(),
    };
  });
}

export async function createCaseFromTemplateSelection(
  input: CreateCaseFromTemplateSelectionInput,
): Promise<AdminCaseFromTemplateSelectionDTO> {
  const targetVisaType = normalizeRequiredText(input.applyingVisaType, "applyingVisaType");
  const currentVisaType = normalizeOptionalText(input.existingVisaType) ?? defaultCurrentVisaType;
  const internalNote = normalizeOptionalText(input.internalNote);
  const templateId = normalizeRequiredText(input.templateId, "templateId");
  const selectedTemplateItemIds = normalizeSelectedTemplateItemIds(input.selectedTemplateItemIds);
  const customItems = normalizeCustomItems(input.customItems);
  const customer =
    input.customer.mode === "create"
      ? {
          mode: "create" as const,
          name: normalizeRequiredText(input.customer.name, "name"),
          email: normalizeOptionalText(input.customer.email),
          phone: normalizeOptionalText(input.customer.phone),
          address: normalizeOptionalText(input.customer.address),
          nationality: normalizeOptionalText(input.customer.nationality),
          birthday: normalizeOptionalDate(input.customer.birthday, "birthday"),
          passportNumber: normalizeOptionalText(input.customer.passportNumber),
          residenceCardNumber: normalizeOptionalText(input.customer.residenceCardNumber),
        }
      : {
          mode: "reuse" as const,
          customerId: normalizeRequiredText(input.customer.customerId, "customerId"),
        };

  for (let attempt = 1; attempt <= maxCaseNumberAttempts; attempt += 1) {
    try {
      return await createCaseFromTemplateSelectionOnce({
        customer,
        currentVisaType,
        targetVisaType,
        internalNote,
        templateId,
        selectedTemplateItemIds,
        customItems,
      });
    } catch (error) {
      if (attempt < maxCaseNumberAttempts && isUniqueCaseNumberError(error)) {
        continue;
      }

      throw error;
    }
  }

  throw new TemplateSelectionAccessError("Case number could not be generated.");
}
