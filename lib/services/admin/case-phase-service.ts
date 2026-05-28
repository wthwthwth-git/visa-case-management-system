import { prisma } from "@/lib/prisma";
import type { CasePhase } from "@prisma/client";
import { createTimelineEvent } from "../shared/timeline";

const maxReasonLength = 500;
const maxSubmissionNumberLength = 100;
const unsafeTextPattern =
  /(token|tokenHash|plaintextToken|signedUrl|storagePath|storageBucket|originalFileName|passport|residenceCard|https?:\/\/|x-amz-signature)/i;

const casePhases: CasePhase[] = [
  "draft",
  "collecting_documents",
  "preparing_application",
  "submitted",
  "approved",
];

export type CasePhaseWarning = {
  type: "required_requirements_incomplete";
  count: number;
};

export type ChangeCasePhaseInput = {
  caseId: string;
  newPhase: CasePhase;
  reason?: string;
  submittedAt?: Date;
  submissionNumber?: string;
  resultAt?: Date;
};

export type ChangeCasePhaseResult = {
  caseId: string;
  oldPhase: CasePhase;
  newPhase: CasePhase;
  warnings: CasePhaseWarning[];
  updatedAt: string;
};

export class CasePhaseAccessError extends Error {
  constructor() {
    super("Case phase cannot be changed.");
    this.name = "CasePhaseAccessError";
  }
}

export class InvalidCasePhaseTransitionError extends Error {
  constructor(message = "Case phase transition is not allowed.") {
    super(message);
    this.name = "InvalidCasePhaseTransitionError";
  }
}

export class InvalidCasePhaseMetadataError extends Error {
  constructor(message = "Case phase metadata is invalid.") {
    super(message);
    this.name = "InvalidCasePhaseMetadataError";
  }
}

function normalizeOptionalText(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeSafeText(input: {
  value: string | undefined;
  fieldName: string;
  maxLength: number;
}) {
  const normalized = normalizeOptionalText(input.value);

  if (normalized === undefined) {
    return undefined;
  }

  if (normalized.length > input.maxLength) {
    throw new InvalidCasePhaseMetadataError(
      `${input.fieldName} must be ${input.maxLength} characters or fewer.`,
    );
  }

  if (unsafeTextPattern.test(normalized)) {
    throw new InvalidCasePhaseMetadataError(`${input.fieldName} contains unsafe content.`);
  }

  return normalized;
}

function assertAllowedTransition(oldPhase: CasePhase, newPhase: CasePhase) {
  if (!casePhases.includes(newPhase)) {
    throw new InvalidCasePhaseTransitionError();
  }

  if (oldPhase === newPhase) {
    throw new InvalidCasePhaseTransitionError("Please choose a different case phase.");
  }
}

function shouldCheckRequiredRequirements(newPhase: CasePhase) {
  return newPhase === "submitted";
}

function buildTimelineMetadata(input: {
  oldPhase: CasePhase;
  newPhase: CasePhase;
  reason?: string;
  warnings: CasePhaseWarning[];
  submittedAt?: Date;
  submissionNumber?: string;
  resultAt?: Date;
}) {
  return {
    oldPhase: input.oldPhase,
    newPhase: input.newPhase,
    ...(input.reason === undefined ? {} : { reason: input.reason }),
    ...(input.warnings.length === 0 ? {} : { warnings: input.warnings }),
    ...(input.submittedAt === undefined
      ? {}
      : { submittedAt: input.submittedAt.toISOString() }),
    ...(input.submissionNumber === undefined
      ? {}
      : { submissionNumber: input.submissionNumber }),
    ...(input.resultAt === undefined ? {} : { resultAt: input.resultAt.toISOString() }),
  };
}

export async function changeCasePhase(
  input: ChangeCasePhaseInput,
): Promise<ChangeCasePhaseResult> {
  const reason = normalizeSafeText({
    value: input.reason,
    fieldName: "reason",
    maxLength: maxReasonLength,
  });
  const submissionNumber = normalizeSafeText({
    value: input.submissionNumber,
    fieldName: "submissionNumber",
    maxLength: maxSubmissionNumberLength,
  });

  const result = await prisma.$transaction(async (tx) => {
    const visaCase = await tx.case.findUnique({
      where: { id: input.caseId },
      select: {
        id: true,
        casePhase: true,
      },
    });

    if (!visaCase) {
      throw new CasePhaseAccessError();
    }

    assertAllowedTransition(visaCase.casePhase, input.newPhase);

    const warnings: CasePhaseWarning[] = [];

    if (shouldCheckRequiredRequirements(input.newPhase)) {
      const incompleteRequiredCount = await tx.caseDocumentRequirement.count({
        where: {
          caseId: input.caseId,
          isRequired: true,
          status: {
            notIn: ["approved", "not_applicable"],
          },
        },
      });

      if (incompleteRequiredCount > 0) {
        warnings.push({
          type: "required_requirements_incomplete",
          count: incompleteRequiredCount,
        });
      }
    }

    const updatedCase = await tx.case.update({
      where: { id: input.caseId },
      data: { casePhase: input.newPhase },
      select: {
        id: true,
        casePhase: true,
        updatedAt: true,
      },
    });

    await createTimelineEvent(
      {
        caseId: input.caseId,
        eventType: "case_phase_changed",
        actorType: "internal",
        summary: "Case phase changed.",
        targetType: "case",
        targetId: input.caseId,
        metadata: buildTimelineMetadata({
          oldPhase: visaCase.casePhase,
          newPhase: input.newPhase,
          reason,
          warnings,
          submittedAt: input.submittedAt,
          submissionNumber,
          resultAt: input.resultAt,
        }),
      },
      tx,
    );

    return {
      oldPhase: visaCase.casePhase,
      updatedCase,
      warnings,
    };
  });

  return {
    caseId: result.updatedCase.id,
    oldPhase: result.oldPhase,
    newPhase: result.updatedCase.casePhase,
    warnings: result.warnings,
    updatedAt: result.updatedCase.updatedAt.toISOString(),
  };
}
