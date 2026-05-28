import { prisma } from "@/lib/prisma";
import { createTimelineEvent } from "../shared/timeline";

const maxInternalNoteLength = 5000;
const unsafeNotePattern =
  /(tokenHash|plaintextToken|signedUrl|storagePath|storageBucket|x-amz-signature)/i;

export class RequirementNoteAccessError extends Error {
  constructor() {
    super("Requirement note cannot be updated.");
    this.name = "RequirementNoteAccessError";
  }
}

export class InvalidRequirementNoteInputError extends Error {
  constructor(message = "Requirement note input is invalid.") {
    super(message);
    this.name = "InvalidRequirementNoteInputError";
  }
}

export type UpdateRequirementInternalNoteInput = {
  caseId: string;
  requirementId: string;
  customerInstruction?: string;
  internalNote?: string;
  dueDate?: Date | null;
};

export type UpdatedRequirementInternalNoteDTO = {
  id: string;
  caseId: string;
  title: string;
  customerInstruction: string | null;
  internalNote: string | null;
  dueDate: string | null;
  updatedAt: string;
};

function normalizeOptionalNote(value: string | undefined, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    return null;
  }

  if (normalized.length > maxInternalNoteLength) {
    throw new InvalidRequirementNoteInputError(`${fieldName} must be 5000 characters or fewer.`);
  }

  if (unsafeNotePattern.test(normalized)) {
    throw new InvalidRequirementNoteInputError(`${fieldName} contains unsafe content.`);
  }

  return normalized;
}

function toUpdatedRequirementInternalNoteDTO(requirement: {
  id: string;
  caseId: string;
  title: string;
  customerInstruction: string | null;
  internalNote: string | null;
  dueDate: Date | null;
  updatedAt: Date;
}): UpdatedRequirementInternalNoteDTO {
  return {
    id: requirement.id,
    caseId: requirement.caseId,
    title: requirement.title,
    customerInstruction: requirement.customerInstruction,
    internalNote: requirement.internalNote,
    dueDate: requirement.dueDate?.toISOString() ?? null,
    updatedAt: requirement.updatedAt.toISOString(),
  };
}

export async function updateRequirementInternalNote(
  input: UpdateRequirementInternalNoteInput,
): Promise<UpdatedRequirementInternalNoteDTO> {
  const customerInstruction = normalizeOptionalNote(
    input.customerInstruction,
    "Customer instruction",
  );
  const internalNote = normalizeOptionalNote(input.internalNote, "Internal note");

  const updatedRequirement = await prisma.$transaction(async (tx) => {
    const requirement = await tx.caseDocumentRequirement.findUnique({
      where: { id: input.requirementId },
      select: {
        id: true,
        caseId: true,
        customerInstruction: true,
        internalNote: true,
        dueDate: true,
      },
    });

    if (!requirement || requirement.caseId !== input.caseId) {
      throw new RequirementNoteAccessError();
    }

    const updated = await tx.caseDocumentRequirement.update({
      where: { id: requirement.id },
      data: {
        ...(customerInstruction === undefined ? {} : { customerInstruction }),
        ...(internalNote === undefined ? {} : { internalNote }),
        ...(input.dueDate === undefined ? {} : { dueDate: input.dueDate }),
      },
      select: {
        id: true,
        caseId: true,
        title: true,
        customerInstruction: true,
        internalNote: true,
        dueDate: true,
        updatedAt: true,
      },
    });

    await createTimelineEvent(
      {
        caseId: input.caseId,
        eventType: requirement.internalNote ? "internal_note_updated" : "internal_note_created",
        actorType: "internal",
        summary: requirement.internalNote ? "Internal note updated." : "Internal note created.",
        targetType: "case_document_requirement",
        targetId: requirement.id,
        metadata: {
          requirementId: requirement.id,
        },
      },
      tx,
    );

    return updated;
  });

  return toUpdatedRequirementInternalNoteDTO(updatedRequirement);
}
