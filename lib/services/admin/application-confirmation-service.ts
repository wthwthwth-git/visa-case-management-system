import { prisma } from "@/lib/prisma";
import type { ApplicationConfirmationStatus } from "@prisma/client";
import { createTimelineEvent } from "../shared/timeline";

const maxReasonLength = 500;
const maxTitleLength = 200;
const unsafeReasonPattern =
  /(token|tokenHash|plaintextToken|signedUrl|storagePath|storageBucket|originalFileName|passport|residenceCard|internalNote|https?:\/\/|x-amz-signature)/i;

export type CreateApplicationConfirmationVersionInput = {
  caseId: string;
  title: string;
  version?: number;
  storageBucket: string;
  storagePath: string;
  supersedePendingVersions?: boolean;
  reason?: string;
};

export type AdminApplicationConfirmationDTO = {
  id: string;
  caseId: string;
  title: string;
  version: number;
  status: ApplicationConfirmationStatus;
  confirmedAt: string | null;
  supersededAt: string | null;
  createdAt: string;
};

export class ApplicationConfirmationAdminError extends Error {
  constructor(message = "Application confirmation version cannot be created.") {
    super(message);
    this.name = "ApplicationConfirmationAdminError";
  }
}

export class InvalidApplicationConfirmationInputError extends Error {
  constructor(message = "Application confirmation input is invalid.") {
    super(message);
    this.name = "InvalidApplicationConfirmationInputError";
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
    throw new InvalidApplicationConfirmationInputError("Title is required.");
  }

  if (normalized.length > maxTitleLength) {
    throw new InvalidApplicationConfirmationInputError(
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
    throw new InvalidApplicationConfirmationInputError(
      "Reason must be 500 characters or fewer.",
    );
  }

  if (unsafeReasonPattern.test(normalized)) {
    throw new InvalidApplicationConfirmationInputError("Reason contains unsafe content.");
  }

  return normalized;
}

function resolveVersion(inputVersion: number | undefined, latestVersion: number | null) {
  if (inputVersion !== undefined) {
    if (!Number.isInteger(inputVersion) || inputVersion <= 0) {
      throw new InvalidApplicationConfirmationInputError("Version must be a positive integer.");
    }

    return inputVersion;
  }

  return (latestVersion ?? 0) + 1;
}

function toAdminApplicationConfirmationDTO(confirmation: {
  id: string;
  caseId: string;
  title: string;
  version: number;
  status: ApplicationConfirmationStatus;
  confirmedAt: Date | null;
  supersededAt: Date | null;
  createdAt: Date;
}): AdminApplicationConfirmationDTO {
  return {
    id: confirmation.id,
    caseId: confirmation.caseId,
    title: confirmation.title,
    version: confirmation.version,
    status: confirmation.status,
    confirmedAt: confirmation.confirmedAt?.toISOString() ?? null,
    supersededAt: confirmation.supersededAt?.toISOString() ?? null,
    createdAt: confirmation.createdAt.toISOString(),
  };
}

function buildConfirmationMetadata(input: {
  confirmationId: string;
  title: string;
  version: number;
  reason?: string;
  supersededConfirmationIds?: string[];
}) {
  return {
    confirmationId: input.confirmationId,
    title: input.title,
    version: input.version,
    ...(input.reason === undefined ? {} : { reason: input.reason }),
    ...(input.supersededConfirmationIds === undefined ||
    input.supersededConfirmationIds.length === 0
      ? {}
      : { supersededConfirmationIds: input.supersededConfirmationIds }),
  };
}

function buildStatusChangedMetadata(input: {
  confirmationId: string;
  title: string;
  version: number;
  oldStatus: ApplicationConfirmationStatus;
  newStatus: ApplicationConfirmationStatus;
  reason?: string;
}) {
  return {
    confirmationId: input.confirmationId,
    title: input.title,
    version: input.version,
    oldStatus: input.oldStatus,
    newStatus: input.newStatus,
    ...(input.reason === undefined ? {} : { reason: input.reason }),
  };
}

export async function createApplicationConfirmationVersion(
  input: CreateApplicationConfirmationVersionInput,
): Promise<AdminApplicationConfirmationDTO> {
  const title = normalizeTitle(input.title);
  const reason = normalizeReason(input.reason);

  const confirmation = await prisma.$transaction(async (tx) => {
    await tx.case.findUniqueOrThrow({
      where: { id: input.caseId },
      select: { id: true },
    });

    const latestConfirmation = await tx.applicationConfirmation.findFirst({
      where: {
        caseId: input.caseId,
        title,
      },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = resolveVersion(input.version, latestConfirmation?.version ?? null);

    const pendingConfirmations = input.supersedePendingVersions
      ? await tx.applicationConfirmation.findMany({
          where: {
            caseId: input.caseId,
            title,
            status: "pending",
          },
          select: {
            id: true,
            version: true,
          },
        })
      : [];

    if (pendingConfirmations.length > 0) {
      await tx.applicationConfirmation.updateMany({
        where: {
          id: {
            in: pendingConfirmations.map((pending) => pending.id),
          },
        },
        data: {
          status: "superseded",
          supersededAt: new Date(),
        },
      });
    }

    const createdConfirmation = await tx.applicationConfirmation.create({
      data: {
        caseId: input.caseId,
        title,
        version,
        storageBucket: input.storageBucket,
        storagePath: input.storagePath,
        status: "pending",
      },
    });

    for (const pending of pendingConfirmations) {
      await createTimelineEvent(
        {
          caseId: input.caseId,
          eventType: "application_confirmation_status_changed",
          actorType: "internal",
          summary: "Application confirmation status changed.",
          targetType: "application_confirmation",
          targetId: pending.id,
          metadata: buildStatusChangedMetadata({
            confirmationId: pending.id,
            title,
            version: pending.version,
            oldStatus: "pending",
            newStatus: "superseded",
            reason,
          }),
        },
        tx,
      );
    }

    await createTimelineEvent(
      {
        caseId: input.caseId,
        eventType:
          latestConfirmation === null
            ? "application_confirmation_created"
            : "application_confirmation_version_created",
        actorType: "internal",
        summary:
          latestConfirmation === null
            ? "Application confirmation created."
            : "Application confirmation version created.",
        targetType: "application_confirmation",
        targetId: createdConfirmation.id,
        metadata: buildConfirmationMetadata({
          confirmationId: createdConfirmation.id,
          title,
          version,
          reason,
          supersededConfirmationIds: pendingConfirmations.map((pending) => pending.id),
        }),
      },
      tx,
    );

    return createdConfirmation;
  });

  return toAdminApplicationConfirmationDTO(confirmation);
}
