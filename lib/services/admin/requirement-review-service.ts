import { prisma } from "@/lib/prisma";
import type { RequirementStatus } from "@prisma/client";
import { createTimelineEvent } from "../shared/timeline";

const maxReasonLength = 500;
const unsafeReasonPattern =
  /(token|tokenHash|plaintextToken|signedUrl|storagePath|storageBucket|originalFileName|passport|residenceCard|https?:\/\/|x-amz-signature)/i;

const allowedTransitions: Record<RequirementStatus, RequirementStatus[]> = {
  not_submitted: ["submitted", "not_applicable"],
  submitted: ["needs_more", "approved", "not_applicable"],
  needs_more: ["submitted", "approved", "not_applicable"],
  approved: ["needs_more", "not_applicable"],
  not_applicable: ["submitted", "needs_more", "approved"],
};

export class RequirementReviewAccessError extends Error {
  constructor() {
    super("Requirement cannot be reviewed.");
    this.name = "RequirementReviewAccessError";
  }
}

export class InvalidRequirementStatusTransitionError extends Error {
  constructor() {
    super("Requirement status transition is not allowed.");
    this.name = "InvalidRequirementStatusTransitionError";
  }
}

export class InvalidRequirementReviewReasonError extends Error {
  constructor(message = "Requirement review reason is invalid.") {
    super(message);
    this.name = "InvalidRequirementReviewReasonError";
  }
}

export type ReviewCaseDocumentRequirementInput = {
  caseId: string;
  requirementId: string;
  newStatus: RequirementStatus;
  reason?: string;
  customerInstruction?: string;
  internalNote?: string;
};

export type ReviewedRequirementDTO = {
  id: string;
  caseId: string;
  title: string;
  status: RequirementStatus;
  customerInstruction: string | null;
  internalNote: string | null;
  updatedAt: string;
};

function normalizeOptionalText(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeReason(reason: string | undefined) {
  const normalized = normalizeOptionalText(reason);

  if (normalized === undefined) {
    return undefined;
  }

  if (normalized.length > maxReasonLength) {
    throw new InvalidRequirementReviewReasonError(
      "Requirement review reason must be 500 characters or fewer.",
    );
  }

  if (unsafeReasonPattern.test(normalized)) {
    throw new InvalidRequirementReviewReasonError(
      "Requirement review reason contains unsafe content.",
    );
  }

  return normalized;
}

function assertAllowedTransition(oldStatus: RequirementStatus, newStatus: RequirementStatus) {
  if (!allowedTransitions[oldStatus].includes(newStatus)) {
    throw new InvalidRequirementStatusTransitionError();
  }
}

function buildRequirementUpdateData(input: {
  newStatus: RequirementStatus;
  customerInstruction?: string;
  internalNote?: string;
}) {
  return {
    status: input.newStatus,
    ...(input.customerInstruction === undefined
      ? {}
      : { customerInstruction: input.customerInstruction }),
    ...(input.internalNote === undefined ? {} : { internalNote: input.internalNote }),
  };
}

function toReviewedRequirementDTO(requirement: {
  id: string;
  caseId: string;
  title: string;
  status: RequirementStatus;
  customerInstruction: string | null;
  internalNote: string | null;
  updatedAt: Date;
}): ReviewedRequirementDTO {
  return {
    id: requirement.id,
    caseId: requirement.caseId,
    title: requirement.title,
    status: requirement.status,
    customerInstruction: requirement.customerInstruction,
    internalNote: requirement.internalNote,
    updatedAt: requirement.updatedAt.toISOString(),
  };
}

export async function reviewCaseDocumentRequirement(
  input: ReviewCaseDocumentRequirementInput,
): Promise<ReviewedRequirementDTO> {
  const reason = normalizeReason(input.reason);
  const customerInstruction = normalizeOptionalText(input.customerInstruction);
  const internalNote = normalizeOptionalText(input.internalNote);

  const updatedRequirement = await prisma.$transaction(async (tx) => {
    const requirement = await tx.caseDocumentRequirement.findUnique({
      where: { id: input.requirementId },
      select: {
        id: true,
        caseId: true,
        title: true,
        status: true,
        responsibleParty: true,
      },
    });

    if (!requirement || requirement.caseId !== input.caseId) {
      throw new RequirementReviewAccessError();
    }

    assertAllowedTransition(requirement.status, input.newStatus);

    if (
      requirement.responsibleParty === "customer" &&
      (input.newStatus === "needs_more" || input.newStatus === "not_applicable") &&
      !reason &&
      !customerInstruction
    ) {
      throw new InvalidRequirementStatusTransitionError();
    }

    const reviewedRequirement = await tx.caseDocumentRequirement.update({
      where: { id: requirement.id },
      data: buildRequirementUpdateData({
        newStatus: input.newStatus,
        customerInstruction,
        internalNote,
      }),
      select: {
        id: true,
        caseId: true,
        title: true,
        status: true,
        customerInstruction: true,
        internalNote: true,
        updatedAt: true,
      },
    });

    await createTimelineEvent(
      {
        caseId: input.caseId,
        eventType: "requirement_status_changed",
        actorType: "internal",
        summary: "Requirement status changed.",
        targetType: "case_document_requirement",
        targetId: requirement.id,
        metadata: {
          requirementId: requirement.id,
          oldStatus: requirement.status,
          newStatus: input.newStatus,
          ...(reason === undefined ? {} : { reason }),
        },
      },
      tx,
    );

    return reviewedRequirement;
  });

  return toReviewedRequirementDTO(updatedRequirement);
}
