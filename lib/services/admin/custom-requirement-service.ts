import { prisma } from "@/lib/prisma";
import type { ResponsibleParty } from "@prisma/client";
import { createTimelineEvent } from "../shared/timeline";

const maxTitleLength = 200;
const unsafeTextPattern =
  /(token|tokenHash|plaintextToken|signedUrl|storagePath|storageBucket|originalFileName|passport|residenceCard|https?:\/\/|x-amz-signature)/i;

export class CustomRequirementAccessError extends Error {
  constructor() {
    super("Custom requirement cannot be created.");
    this.name = "CustomRequirementAccessError";
  }
}

export class InvalidCustomRequirementInputError extends Error {
  constructor(message = "Custom requirement input is invalid.") {
    super(message);
    this.name = "InvalidCustomRequirementInputError";
  }
}

export type AddCustomRequirementInput = {
  caseId: string;
  title: string;
  responsibleParty: ResponsibleParty;
  customerInstruction?: string;
  dueDate?: Date;
};

export type CustomRequirementDTO = {
  id: string;
  caseId: string;
  title: string;
  responsibleParty: ResponsibleParty;
  sourceType: "custom";
  status: "not_submitted";
  portalVisible: boolean;
  portalDownloadable: boolean;
  customerInstruction: string | null;
  dueDate: string | null;
  createdAt: string;
};

function normalizeOptionalText(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeTitle(title: string) {
  const normalized = title.trim();

  if (!normalized) {
    throw new InvalidCustomRequirementInputError("Title is required.");
  }

  if (normalized.length > maxTitleLength) {
    throw new InvalidCustomRequirementInputError(
      `Title must be ${maxTitleLength} characters or fewer.`,
    );
  }

  if (unsafeTextPattern.test(normalized)) {
    throw new InvalidCustomRequirementInputError("Title contains unsafe content.");
  }

  return normalized;
}

function normalizeInstruction(value: string | undefined) {
  const normalized = normalizeOptionalText(value);

  if (normalized === undefined) {
    return undefined;
  }

  if (unsafeTextPattern.test(normalized)) {
    throw new InvalidCustomRequirementInputError("Instruction contains unsafe content.");
  }

  return normalized;
}

function assertResponsibleParty(responsibleParty: ResponsibleParty) {
  if (responsibleParty !== "customer" && responsibleParty !== "office") {
    throw new InvalidCustomRequirementInputError("Responsible party is invalid.");
  }
}

function toCustomRequirementDTO(requirement: {
  id: string;
  caseId: string;
  title: string;
  responsibleParty: ResponsibleParty;
  portalVisible: boolean;
  portalDownloadable: boolean;
  customerInstruction: string | null;
  dueDate: Date | null;
  createdAt: Date;
}): CustomRequirementDTO {
  return {
    id: requirement.id,
    caseId: requirement.caseId,
    title: requirement.title,
    responsibleParty: requirement.responsibleParty,
    sourceType: "custom",
    status: "not_submitted",
    portalVisible: requirement.portalVisible,
    portalDownloadable: requirement.portalDownloadable,
    customerInstruction: requirement.customerInstruction,
    dueDate: requirement.dueDate?.toISOString() ?? null,
    createdAt: requirement.createdAt.toISOString(),
  };
}

export async function addCustomRequirement(
  input: AddCustomRequirementInput,
): Promise<CustomRequirementDTO> {
  assertResponsibleParty(input.responsibleParty);

  const title = normalizeTitle(input.title);
  const customerInstruction = normalizeInstruction(input.customerInstruction);
  const portalVisible = input.responsibleParty === "customer";
  const dueDate = input.responsibleParty === "customer" ? input.dueDate : undefined;

  const createdRequirement = await prisma.$transaction(async (tx) => {
    const visaCase = await tx.case.findUnique({
      where: { id: input.caseId },
      select: { id: true },
    });

    if (!visaCase) {
      throw new CustomRequirementAccessError();
    }

    const currentLastRequirement = await tx.caseDocumentRequirement.aggregate({
      where: {
        caseId: input.caseId,
        responsibleParty: input.responsibleParty,
        sourceType: { not: "immigration_request" },
      },
      _max: {
        sortOrder: true,
      },
    });
    const sortOrder = (currentLastRequirement._max.sortOrder ?? 0) + 1;

    const requirement = await tx.caseDocumentRequirement.create({
      data: {
        caseId: input.caseId,
        title,
        customerInstruction,
        responsibleParty: input.responsibleParty,
        sourceType: "custom",
        status: "not_submitted",
        sortOrder,
        portalVisible,
        portalDownloadable: false,
        dueDate,
      },
      select: {
        id: true,
        caseId: true,
        title: true,
        responsibleParty: true,
        portalVisible: true,
        portalDownloadable: true,
        customerInstruction: true,
        dueDate: true,
        createdAt: true,
      },
    });

    await createTimelineEvent(
      {
        caseId: input.caseId,
        eventType: "requirement_created",
        actorType: "internal",
        summary: "Custom requirement created.",
        targetType: "case_document_requirement",
        targetId: requirement.id,
        metadata: {
          requirementId: requirement.id,
          sourceType: "custom",
          responsibleParty: input.responsibleParty,
        },
      },
      tx,
    );

    return requirement;
  });

  return toCustomRequirementDTO(createdRequirement);
}
