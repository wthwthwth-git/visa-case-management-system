import { prisma } from "@/lib/prisma";
import type { CasePhase, ResponsibleParty } from "@prisma/client";
import { createTimelineEvent } from "../shared/timeline";

const maxReasonLength = 500;
const maxTitleLength = 200;
const unsafeReasonPattern =
  /(token|tokenHash|plaintextToken|signedUrl|storagePath|storageBucket|originalFileName|passport|residenceCard|https?:\/\/|x-amz-signature)/i;

export type AddImmigrationAdditionalRequirementInput = {
  caseId: string;
  title: string;
  responsibleParty: ResponsibleParty;
  customerInstruction?: string;
  internalNote?: string;
  dueDate?: Date;
  reason?: string;
  portalVisible?: boolean;
  portalDownloadable?: boolean;
  setCasePhase?: boolean;
};

export type ImmigrationAdditionalRequirementDTO = {
  id: string;
  caseId: string;
  title: string;
  responsibleParty: ResponsibleParty;
  sourceType: "immigration_request";
  status: "not_submitted";
  portalVisible: boolean;
  portalDownloadable: boolean;
  customerInstruction: string | null;
  internalNote: string | null;
  dueDate: string | null;
  createdAt: string;
};

export class ImmigrationRequirementAccessError extends Error {
  constructor() {
    super("Immigration additional requirement cannot be created.");
    this.name = "ImmigrationRequirementAccessError";
  }
}

export class InvalidImmigrationRequirementInputError extends Error {
  constructor(message = "Immigration additional requirement input is invalid.") {
    super(message);
    this.name = "InvalidImmigrationRequirementInputError";
  }
}

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
    throw new InvalidImmigrationRequirementInputError("Title is required.");
  }

  if (normalized.length > maxTitleLength) {
    throw new InvalidImmigrationRequirementInputError(
      `Title must be ${maxTitleLength} characters or fewer.`,
    );
  }

  return normalized;
}

function normalizeReason(reason: string | undefined) {
  const normalized = normalizeOptionalText(reason);

  if (normalized === undefined) {
    return undefined;
  }

  if (normalized.length > maxReasonLength) {
    throw new InvalidImmigrationRequirementInputError(
      "Reason must be 500 characters or fewer.",
    );
  }

  if (unsafeReasonPattern.test(normalized)) {
    throw new InvalidImmigrationRequirementInputError("Reason contains unsafe content.");
  }

  return normalized;
}

function assertResponsibleParty(responsibleParty: ResponsibleParty) {
  if (responsibleParty !== "customer" && responsibleParty !== "office") {
    throw new InvalidImmigrationRequirementInputError("Responsible party is invalid.");
  }
}

function resolvePortalVisibility(input: {
  responsibleParty: ResponsibleParty;
  portalVisible?: boolean;
  portalDownloadable?: boolean;
}) {
  const defaultPortalVisible = input.responsibleParty === "customer";
  const portalDownloadable = input.portalDownloadable ?? false;
  const portalVisible = portalDownloadable
    ? true
    : (input.portalVisible ?? defaultPortalVisible);

  return {
    portalVisible,
    portalDownloadable,
  };
}

function buildRequirementCreatedMetadata(input: {
  requirementId: string;
  responsibleParty: ResponsibleParty;
  dueDate?: Date;
  reason?: string;
}) {
  return {
    requirementId: input.requirementId,
    sourceType: "immigration_request",
    responsibleParty: input.responsibleParty,
    ...(input.dueDate === undefined ? {} : { dueDate: input.dueDate.toISOString() }),
    ...(input.reason === undefined ? {} : { reason: input.reason }),
  };
}

function buildCasePhaseChangedMetadata(input: {
  oldPhase: CasePhase;
  newPhase: CasePhase;
  reason?: string;
}) {
  return {
    oldPhase: input.oldPhase,
    newPhase: input.newPhase,
    ...(input.reason === undefined ? {} : { reason: input.reason }),
  };
}

function toImmigrationAdditionalRequirementDTO(requirement: {
  id: string;
  caseId: string;
  title: string;
  responsibleParty: ResponsibleParty;
  portalVisible: boolean;
  portalDownloadable: boolean;
  customerInstruction: string | null;
  internalNote: string | null;
  dueDate: Date | null;
  createdAt: Date;
}): ImmigrationAdditionalRequirementDTO {
  return {
    id: requirement.id,
    caseId: requirement.caseId,
    title: requirement.title,
    responsibleParty: requirement.responsibleParty,
    sourceType: "immigration_request",
    status: "not_submitted",
    portalVisible: requirement.portalVisible,
    portalDownloadable: requirement.portalDownloadable,
    customerInstruction: requirement.customerInstruction,
    internalNote: requirement.internalNote,
    dueDate: requirement.dueDate?.toISOString() ?? null,
    createdAt: requirement.createdAt.toISOString(),
  };
}

export async function addImmigrationAdditionalRequirement(
  input: AddImmigrationAdditionalRequirementInput,
): Promise<ImmigrationAdditionalRequirementDTO> {
  assertResponsibleParty(input.responsibleParty);

  const title = normalizeTitle(input.title);
  const reason = normalizeReason(input.reason);
  const customerInstruction = normalizeOptionalText(input.customerInstruction);
  const internalNote = normalizeOptionalText(input.internalNote);
  const visibility = resolvePortalVisibility({
    responsibleParty: input.responsibleParty,
    portalVisible: input.portalVisible,
    portalDownloadable: input.portalDownloadable,
  });

  const requirement = await prisma.$transaction(async (tx) => {
    const visaCase = await tx.case.findUnique({
      where: { id: input.caseId },
      select: {
        id: true,
        casePhase: true,
      },
    });

    if (!visaCase) {
      throw new ImmigrationRequirementAccessError();
    }

    const createdRequirement = await tx.caseDocumentRequirement.create({
      data: {
        caseId: input.caseId,
        title,
        customerInstruction,
        internalNote,
        responsibleParty: input.responsibleParty,
        sourceType: "immigration_request",
        status: "not_submitted",
        portalVisible: visibility.portalVisible,
        portalDownloadable: visibility.portalDownloadable,
        dueDate: input.dueDate,
      },
      select: {
        id: true,
        caseId: true,
        title: true,
        responsibleParty: true,
        sourceType: true,
        status: true,
        portalVisible: true,
        portalDownloadable: true,
        customerInstruction: true,
        internalNote: true,
        dueDate: true,
        createdAt: true,
      },
    });

    await createTimelineEvent(
      {
        caseId: input.caseId,
        eventType: "requirement_created",
        actorType: "internal",
        summary: "Immigration additional requirement created.",
        targetType: "case_document_requirement",
        targetId: createdRequirement.id,
        metadata: buildRequirementCreatedMetadata({
          requirementId: createdRequirement.id,
          responsibleParty: input.responsibleParty,
          dueDate: input.dueDate,
          reason,
        }),
      },
      tx,
    );

    if (input.setCasePhase) {
      await tx.case.update({
        where: { id: input.caseId },
        data: { casePhase: "collecting_documents" },
      });

      await createTimelineEvent(
        {
          caseId: input.caseId,
          eventType: "case_phase_changed",
          actorType: "internal",
          summary: "Case phase changed.",
          targetType: "case",
          targetId: input.caseId,
          metadata: buildCasePhaseChangedMetadata({
            oldPhase: visaCase.casePhase,
            newPhase: "collecting_documents",
            reason,
          }),
        },
        tx,
      );
    }

    return createdRequirement;
  });

  return toImmigrationAdditionalRequirementDTO(requirement);
}
