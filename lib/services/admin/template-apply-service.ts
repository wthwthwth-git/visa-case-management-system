import { prisma } from "@/lib/prisma";
import type { ResponsibleParty } from "@prisma/client";
import { createTimelineEvent } from "../shared/timeline";

const maxReasonLength = 500;
const unsafeReasonPattern =
  /(token|tokenHash|plaintextToken|signedUrl|storagePath|storageBucket|passport|residenceCard|internalNote|https?:\/\/|x-amz-signature)/i;

export type ApplyDocumentTemplateToCaseInput = {
  caseId: string;
  templateId?: string;
  templateKey?: string;
  version?: number;
  reason?: string;
  allowMultipleTemplates?: boolean;
};

export type AdminAppliedTemplateDTO = {
  caseId: string;
  templateId: string;
  templateKey: string;
  templateVersion: number;
  copiedRequirementCount: number;
  requirementIds: string[];
};

export class TemplateApplyAccessError extends Error {
  constructor(message = "Template cannot be applied to this case.") {
    super(message);
    this.name = "TemplateApplyAccessError";
  }
}

export class InvalidTemplateApplyInputError extends Error {
  constructor(message = "Template apply input is invalid.") {
    super(message);
    this.name = "InvalidTemplateApplyInputError";
  }
}

export class TemplateAlreadyAppliedError extends Error {
  constructor(message = "Template is already applied to this case.") {
    super(message);
    this.name = "TemplateAlreadyAppliedError";
  }
}

type TemplateWithItems = {
  id: string;
  templateKey: string;
  version: number;
  status: string;
  items: Array<{
    id: string;
    title: string;
    customerInstruction: string | null;
    internalNote: string | null;
    isRequired: boolean;
    responsibleParty: ResponsibleParty;
    sortOrder: number;
    acceptedFileTypesDescription: string | null;
  }>;
};

function normalizeRequiredText(value: string | undefined, fieldName: string) {
  const normalized = value?.trim();

  if (!normalized) {
    throw new InvalidTemplateApplyInputError(`${fieldName} is required.`);
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

function normalizeVersion(value: number | undefined) {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw new InvalidTemplateApplyInputError("Template version must be a positive integer.");
  }

  return value;
}

function normalizeReason(value: string | undefined) {
  const normalized = normalizeOptionalText(value);

  if (normalized === undefined) {
    return undefined;
  }

  if (normalized.length > maxReasonLength) {
    throw new InvalidTemplateApplyInputError("Reason must be 500 characters or fewer.");
  }

  if (unsafeReasonPattern.test(normalized)) {
    throw new InvalidTemplateApplyInputError("Reason contains unsafe content.");
  }

  return normalized;
}

function resolvePortalVisible(responsibleParty: ResponsibleParty) {
  return responsibleParty === "customer";
}

async function findTemplate(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  input: {
    templateId?: string;
    templateKey?: string;
    version?: number;
  },
): Promise<TemplateWithItems | null> {
  const include = {
    items: {
      orderBy: { sortOrder: "asc" as const },
    },
  };

  if (input.templateId) {
    return tx.documentTemplate.findUnique({
      where: { id: input.templateId },
      include,
    });
  }

  if (!input.templateKey) {
    return null;
  }

  if (input.version !== undefined) {
    return tx.documentTemplate.findFirst({
      where: {
        templateKey: input.templateKey,
        version: input.version,
        status: "active",
      },
      include,
    });
  }

  return tx.documentTemplate.findFirst({
    where: {
      templateKey: input.templateKey,
      status: "active",
    },
    include,
    orderBy: { version: "desc" },
  });
}

export async function applyDocumentTemplateToCase(
  input: ApplyDocumentTemplateToCaseInput,
): Promise<AdminAppliedTemplateDTO> {
  const caseId = normalizeRequiredText(input.caseId, "caseId");
  const templateId = normalizeOptionalText(input.templateId);
  const templateKey = normalizeOptionalText(input.templateKey);
  const version = normalizeVersion(input.version);
  const reason = normalizeReason(input.reason);

  if (!templateId && !templateKey) {
    throw new InvalidTemplateApplyInputError("templateId or templateKey is required.");
  }

  return prisma.$transaction(async (tx) => {
    const visaCase = await tx.case.findUnique({
      where: { id: caseId },
      select: { id: true },
    });

    if (!visaCase) {
      throw new TemplateApplyAccessError("Case does not exist.");
    }

    const template = await findTemplate(tx, {
      templateId,
      templateKey,
      version,
    });

    if (!template || template.status !== "active") {
      throw new TemplateApplyAccessError("Template does not exist or is not active.");
    }

    const existingSameTemplate = await tx.caseDocumentRequirement.findFirst({
      where: {
        caseId,
        sourceType: "template",
        sourceTemplateId: template.id,
        sourceTemplateVersion: template.version,
      },
      select: { id: true },
    });

    if (existingSameTemplate) {
      throw new TemplateAlreadyAppliedError();
    }

    if (!input.allowMultipleTemplates) {
      const existingTemplateRequirement = await tx.caseDocumentRequirement.findFirst({
        where: {
          caseId,
          sourceType: "template",
        },
        select: { id: true },
      });

      if (existingTemplateRequirement) {
        throw new TemplateAlreadyAppliedError("This case already has template requirements.");
      }
    }

    const createdRequirements = [];

    for (const item of template.items) {
      const requirement = await tx.caseDocumentRequirement.create({
        data: {
          caseId,
          title: item.title,
          customerInstruction:
            item.responsibleParty === "office" ? null : item.customerInstruction,
          internalNote: null,
          isRequired: item.isRequired,
          responsibleParty: item.responsibleParty,
          sourceType: "template",
          status: "not_submitted",
          sortOrder: item.sortOrder,
          acceptedFileTypesDescription: item.acceptedFileTypesDescription,
          portalVisible: resolvePortalVisible(item.responsibleParty),
          portalDownloadable: false,
          sourceTemplateId: template.id,
          sourceTemplateVersion: template.version,
          sourceTemplateItemId: item.id,
        },
        select: { id: true },
      });

      createdRequirements.push(requirement);
    }

    await createTimelineEvent(
      {
        caseId,
        eventType: "template_items_copied",
        actorType: "internal",
        summary: "Template items copied.",
        targetType: "document_template",
        targetId: template.id,
        metadata: {
          templateId: template.id,
          templateKey: template.templateKey,
          templateVersion: template.version,
          copiedRequirementCount: createdRequirements.length,
          ...(reason === undefined ? {} : { reason }),
        },
      },
      tx,
    );

    return {
      caseId,
      templateId: template.id,
      templateKey: template.templateKey,
      templateVersion: template.version,
      copiedRequirementCount: createdRequirements.length,
      requirementIds: createdRequirements.map((requirement) => requirement.id),
    };
  });
}
