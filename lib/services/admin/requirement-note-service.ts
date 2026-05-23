import { prisma } from "@/lib/prisma";
import { createTimelineEvent } from "../shared/timeline";

const maxInternalNoteLength = 5000;
const unsafeInternalNotePattern =
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
  internalNote?: string;
};

export type UpdatedRequirementInternalNoteDTO = {
  id: string;
  caseId: string;
  title: string;
  internalNote: string | null;
  updatedAt: string;
};

function normalizeInternalNote(value: string | undefined) {
  if (value === undefined) {
    return null;
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    return null;
  }

  if (normalized.length > maxInternalNoteLength) {
    throw new InvalidRequirementNoteInputError("Internal note must be 5000 characters or fewer.");
  }

  if (unsafeInternalNotePattern.test(normalized)) {
    throw new InvalidRequirementNoteInputError("Internal note contains unsafe content.");
  }

  return normalized;
}

function toUpdatedRequirementInternalNoteDTO(requirement: {
  id: string;
  caseId: string;
  title: string;
  internalNote: string | null;
  updatedAt: Date;
}): UpdatedRequirementInternalNoteDTO {
  return {
    id: requirement.id,
    caseId: requirement.caseId,
    title: requirement.title,
    internalNote: requirement.internalNote,
    updatedAt: requirement.updatedAt.toISOString(),
  };
}

export async function updateRequirementInternalNote(
  input: UpdateRequirementInternalNoteInput,
): Promise<UpdatedRequirementInternalNoteDTO> {
  const internalNote = normalizeInternalNote(input.internalNote);

  const updatedRequirement = await prisma.$transaction(async (tx) => {
    const requirement = await tx.caseDocumentRequirement.findUnique({
      where: { id: input.requirementId },
      select: {
        id: true,
        caseId: true,
        internalNote: true,
      },
    });

    if (!requirement || requirement.caseId !== input.caseId) {
      throw new RequirementNoteAccessError();
    }

    const updated = await tx.caseDocumentRequirement.update({
      where: { id: requirement.id },
      data: {
        internalNote,
      },
      select: {
        id: true,
        caseId: true,
        title: true,
        internalNote: true,
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
