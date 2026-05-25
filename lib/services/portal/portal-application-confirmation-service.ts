import { prisma } from "@/lib/prisma";
import type { ApplicationConfirmationStatus } from "@prisma/client";
import { createTimelineEvent } from "../shared/timeline";
import { createAdminNotification } from "../shared/admin-notification";
import { createStorageSignedUrl } from "../shared/supabase-storage";
import type { SignedUrlResult } from "../shared/signed-url";
import { validatePortalToken } from "./portal-token-service";

const maxReasonLength = 500;
const maxCommentLength = 1000;
const unsafeTextPattern =
  /(token|tokenHash|plaintextToken|signedUrl|storagePath|storageBucket|originalFileName|passport|residenceCard|internalNote|https?:\/\/|x-amz-signature)/i;

export type PortalApplicationConfirmationDetailDTO = {
  id: string;
  title: string;
  version: number;
  status: ApplicationConfirmationStatus;
  confirmedAt: string | null;
  createdAt: string;
};

export type ConfirmPortalApplicationConfirmationInput = {
  token: string;
  confirmationId: string;
  reason?: string;
};

export type RequestPortalApplicationConfirmationRevisionInput = {
  token: string;
  confirmationId: string;
  comment?: string;
  reason?: string;
};

export class PortalApplicationConfirmationAccessError extends Error {
  constructor() {
    super("Application confirmation is not accessible.");
    this.name = "PortalApplicationConfirmationAccessError";
  }
}

export class InvalidPortalApplicationConfirmationInputError extends Error {
  constructor(message = "Application confirmation input is invalid.") {
    super(message);
    this.name = "InvalidPortalApplicationConfirmationInputError";
  }
}

function getPortalExpiresInSeconds() {
  const rawValue = process.env.STORAGE_SIGNED_URL_EXPIRES_IN_SECONDS;

  if (!rawValue) {
    return 300;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 300;
}

function getExpiresAt(expiresInSeconds: number) {
  return new Date(Date.now() + expiresInSeconds * 1000);
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
    throw new InvalidPortalApplicationConfirmationInputError(
      `${input.fieldName} must be ${input.maxLength} characters or fewer.`,
    );
  }

  if (unsafeTextPattern.test(normalized)) {
    throw new InvalidPortalApplicationConfirmationInputError(
      `${input.fieldName} contains unsafe content.`,
    );
  }

  return normalized;
}

function toPortalApplicationConfirmationDetailDTO(confirmation: {
  id: string;
  title: string;
  version: number;
  status: ApplicationConfirmationStatus;
  confirmedAt: Date | null;
  createdAt: Date;
}): PortalApplicationConfirmationDetailDTO {
  return {
    id: confirmation.id,
    title: confirmation.title,
    version: confirmation.version,
    status: confirmation.status,
    confirmedAt: confirmation.confirmedAt?.toISOString() ?? null,
    createdAt: confirmation.createdAt.toISOString(),
  };
}

async function validateLatestActionableConfirmation(input: {
  caseId: string;
  confirmationId: string;
  client: {
    applicationConfirmation: {
      findUnique: typeof prisma.applicationConfirmation.findUnique;
      findFirst: typeof prisma.applicationConfirmation.findFirst;
    };
  };
}) {
  const confirmation = await input.client.applicationConfirmation.findUnique({
    where: { id: input.confirmationId },
    select: {
      id: true,
      caseId: true,
      title: true,
      version: true,
      status: true,
      confirmedAt: true,
      createdAt: true,
      storageBucket: true,
      storagePath: true,
    },
  });

  if (!confirmation || confirmation.caseId !== input.caseId) {
    throw new PortalApplicationConfirmationAccessError();
  }

  const latestActionable = await input.client.applicationConfirmation.findFirst({
    where: {
      caseId: input.caseId,
      title: confirmation.title,
      status: {
        in: ["pending", "needs_revision"],
      },
    },
    orderBy: { version: "desc" },
    select: { id: true },
  });

  if (!latestActionable || latestActionable.id !== confirmation.id) {
    throw new PortalApplicationConfirmationAccessError();
  }

  return confirmation;
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

function buildCompletedMetadata(input: {
  confirmationId: string;
  title: string;
  version: number;
}) {
  return {
    confirmationId: input.confirmationId,
    title: input.title,
    version: input.version,
  };
}

export async function confirmPortalApplicationConfirmation(
  input: ConfirmPortalApplicationConfirmationInput,
): Promise<PortalApplicationConfirmationDetailDTO> {
  const reason = normalizeSafeText({
    value: input.reason,
    fieldName: "reason",
    maxLength: maxReasonLength,
  });
  const tokenContext = await validatePortalToken(input.token);

  const confirmation = await prisma.$transaction(async (tx) => {
    const currentConfirmation = await validateLatestActionableConfirmation({
      caseId: tokenContext.caseId,
      confirmationId: input.confirmationId,
      client: tx,
    });

    if (currentConfirmation.status === "confirmed") {
      throw new PortalApplicationConfirmationAccessError();
    }

    const confirmedAt = new Date();
    const updatedConfirmation = await tx.applicationConfirmation.update({
      where: { id: currentConfirmation.id },
      data: {
        status: "confirmed",
        confirmedAt,
      },
      select: {
        id: true,
        title: true,
        version: true,
        status: true,
        confirmedAt: true,
        createdAt: true,
      },
    });

    await createTimelineEvent(
      {
        caseId: tokenContext.caseId,
        eventType: "application_confirmation_completed",
        actorType: "client",
        summary: "Application confirmation completed.",
        targetType: "application_confirmation",
        targetId: currentConfirmation.id,
        metadata: buildCompletedMetadata({
          confirmationId: currentConfirmation.id,
          title: currentConfirmation.title,
          version: currentConfirmation.version,
        }),
      },
      tx,
    );

    await createTimelineEvent(
      {
        caseId: tokenContext.caseId,
        eventType: "application_confirmation_status_changed",
        actorType: "client",
        summary: "Application confirmation status changed.",
        targetType: "application_confirmation",
        targetId: currentConfirmation.id,
        metadata: buildStatusChangedMetadata({
          confirmationId: currentConfirmation.id,
          title: currentConfirmation.title,
          version: currentConfirmation.version,
          oldStatus: currentConfirmation.status,
          newStatus: "confirmed",
          reason,
        }),
      },
      tx,
    );

    await createAdminNotification(
      {
        caseId: tokenContext.caseId,
        type: "application_confirmation_confirmed",
        title: `客户确认了申请书：${currentConfirmation.title} v${currentConfirmation.version}`,
        message: `客户确认了申请书：${currentConfirmation.title} v${currentConfirmation.version}`,
        severity: "info",
        targetType: "application_confirmation",
        targetId: currentConfirmation.id,
        metadata: {
          confirmationId: currentConfirmation.id,
          title: currentConfirmation.title,
          version: currentConfirmation.version,
        },
      },
      tx,
    );

    return updatedConfirmation;
  });

  return toPortalApplicationConfirmationDetailDTO(confirmation);
}

export async function requestPortalApplicationConfirmationRevision(
  input: RequestPortalApplicationConfirmationRevisionInput,
): Promise<PortalApplicationConfirmationDetailDTO> {
  normalizeSafeText({
    value: input.comment,
    fieldName: "comment",
    maxLength: maxCommentLength,
  });
  const reason = normalizeSafeText({
    value: input.reason,
    fieldName: "reason",
    maxLength: maxReasonLength,
  });
  const tokenContext = await validatePortalToken(input.token);

  const confirmation = await prisma.$transaction(async (tx) => {
    const currentConfirmation = await validateLatestActionableConfirmation({
      caseId: tokenContext.caseId,
      confirmationId: input.confirmationId,
      client: tx,
    });

    if (currentConfirmation.status !== "pending") {
      throw new PortalApplicationConfirmationAccessError();
    }

    const updatedConfirmation = await tx.applicationConfirmation.update({
      where: { id: currentConfirmation.id },
      data: {
        status: "needs_revision",
      },
      select: {
        id: true,
        title: true,
        version: true,
        status: true,
        confirmedAt: true,
        createdAt: true,
      },
    });

    await createTimelineEvent(
      {
        caseId: tokenContext.caseId,
        eventType: "application_confirmation_status_changed",
        actorType: "client",
        summary: "Application confirmation status changed.",
        targetType: "application_confirmation",
        targetId: currentConfirmation.id,
        metadata: buildStatusChangedMetadata({
          confirmationId: currentConfirmation.id,
          title: currentConfirmation.title,
          version: currentConfirmation.version,
          oldStatus: currentConfirmation.status,
          newStatus: "needs_revision",
          reason,
        }),
      },
      tx,
    );

    await createAdminNotification(
      {
        caseId: tokenContext.caseId,
        type: "application_confirmation_revision_requested",
        title: `客户要求修改申请书：${currentConfirmation.title} v${currentConfirmation.version}`,
        message: `客户要求修改申请书：${currentConfirmation.title} v${currentConfirmation.version}`,
        severity: "warning",
        targetType: "application_confirmation",
        targetId: currentConfirmation.id,
        metadata: {
          confirmationId: currentConfirmation.id,
          title: currentConfirmation.title,
          version: currentConfirmation.version,
        },
      },
      tx,
    );

    return updatedConfirmation;
  });

  return toPortalApplicationConfirmationDetailDTO(confirmation);
}

export async function createPortalApplicationConfirmationSignedUrl(input: {
  token: string;
  confirmationId: string;
}): Promise<SignedUrlResult> {
  const tokenContext = await validatePortalToken(input.token);
  const confirmation = await validateLatestActionableConfirmation({
    caseId: tokenContext.caseId,
    confirmationId: input.confirmationId,
    client: prisma,
  });
  const expiresInSeconds = getPortalExpiresInSeconds();
  const signedUrl = await createStorageSignedUrl({
    bucket: confirmation.storageBucket,
    path: confirmation.storagePath,
    expiresInSeconds,
  });

  return {
    signedUrl,
    expiresAt: getExpiresAt(expiresInSeconds),
  };
}
