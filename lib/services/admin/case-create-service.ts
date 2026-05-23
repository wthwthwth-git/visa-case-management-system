import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { CasePhase } from "@prisma/client";
import { createTimelineEvent } from "../shared/timeline";

const defaultCurrentVisaType = "unspecified";
const maxCaseNumberAttempts = 5;

export type CreateCaseInput = {
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
};

export type AdminCreatedCaseDTO = {
  id: string;
  customerId: string;
  caseNumber: string;
  currentVisaType: string;
  targetVisaType: string;
  casePhase: CasePhase;
  createdAt: string;
  updatedAt: string;
};

export class CaseCreateAccessError extends Error {
  constructor(message = "Case cannot be created.") {
    super(message);
    this.name = "CaseCreateAccessError";
  }
}

export class InvalidCaseCreateInputError extends Error {
  constructor(message = "Case create input is invalid.") {
    super(message);
    this.name = "InvalidCaseCreateInputError";
  }
}

function normalizeRequiredText(value: string | undefined, fieldName: string) {
  const normalized = value?.trim();

  if (!normalized) {
    throw new InvalidCaseCreateInputError(`${fieldName} is required.`);
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

function normalizeOptionalDate(value: Date | undefined) {
  if (value === undefined) {
    return undefined;
  }

  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new InvalidCaseCreateInputError("Birthday is invalid.");
  }

  return value;
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

function toAdminCreatedCaseDTO(visaCase: {
  id: string;
  customerId: string;
  caseNumber: string;
  currentVisaType: string;
  targetVisaType: string;
  casePhase: CasePhase;
  createdAt: Date;
  updatedAt: Date;
}): AdminCreatedCaseDTO {
  return {
    id: visaCase.id,
    customerId: visaCase.customerId,
    caseNumber: visaCase.caseNumber,
    currentVisaType: visaCase.currentVisaType,
    targetVisaType: visaCase.targetVisaType,
    casePhase: visaCase.casePhase,
    createdAt: visaCase.createdAt.toISOString(),
    updatedAt: visaCase.updatedAt.toISOString(),
  };
}

async function createCaseOnce(input: {
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
}) {
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
      throw new CaseCreateAccessError("Customer does not exist.");
    }

    const createdCase = await tx.case.create({
      data: {
        customerId: customer.id,
        caseNumber: generateCaseNumber(),
        currentVisaType: input.currentVisaType,
        targetVisaType: input.targetVisaType,
        casePhase: "draft",
      },
    });

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
          customerId: customer.id,
          currentVisaType: input.currentVisaType,
          targetVisaType: input.targetVisaType,
        },
      },
      tx,
    );

    if (input.internalNote) {
      const note = await tx.internalNote.create({
        data: {
          caseId: createdCase.id,
          targetType: "case",
          targetId: createdCase.id,
          body: input.internalNote,
        },
        select: { id: true },
      });

      await createTimelineEvent(
        {
          caseId: createdCase.id,
          eventType: "internal_note_created",
          actorType: "internal",
          summary: "Internal note created.",
          targetType: "internal_note",
          targetId: note.id,
          metadata: {
            noteId: note.id,
            targetType: "case",
            targetId: createdCase.id,
          },
        },
        tx,
      );
    }

    return createdCase;
  });
}

export async function createCase(input: CreateCaseInput): Promise<AdminCreatedCaseDTO> {
  const targetVisaType = normalizeRequiredText(input.applyingVisaType, "applyingVisaType");
  const currentVisaType = normalizeOptionalText(input.existingVisaType) ?? defaultCurrentVisaType;
  const internalNote = normalizeOptionalText(input.internalNote);
  const customer =
    input.customer.mode === "create"
      ? {
          mode: "create" as const,
          name: normalizeRequiredText(input.customer.name, "name"),
          email: normalizeOptionalText(input.customer.email),
          phone: normalizeOptionalText(input.customer.phone),
          address: normalizeOptionalText(input.customer.address),
          nationality: normalizeOptionalText(input.customer.nationality),
          birthday: normalizeOptionalDate(input.customer.birthday),
          passportNumber: normalizeOptionalText(input.customer.passportNumber),
          residenceCardNumber: normalizeOptionalText(input.customer.residenceCardNumber),
        }
      : {
          mode: "reuse" as const,
          customerId: normalizeRequiredText(input.customer.customerId, "customerId"),
        };

  for (let attempt = 1; attempt <= maxCaseNumberAttempts; attempt += 1) {
    try {
      const visaCase = await createCaseOnce({
        customer,
        currentVisaType,
        targetVisaType,
        internalNote,
      });

      return toAdminCreatedCaseDTO(visaCase);
    } catch (error) {
      if (attempt < maxCaseNumberAttempts && isUniqueCaseNumberError(error)) {
        continue;
      }

      throw error;
    }
  }

  throw new CaseCreateAccessError("Case number could not be generated.");
}
