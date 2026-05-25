import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { ActorType } from "@prisma/client";
import {
  mapRequirementStatusToPortalStatus,
  type PortalFileDTO,
  type PortalRemovedFileDTO,
  type PortalRequirementSubmissionDTO,
} from "../types";
import { validatePortalToken } from "./portal-token-service";
import { buildDocumentFileStoragePath } from "../shared/storage-path";
import {
  deleteStorageObject,
  getStorageBucketName,
  uploadToStorage,
} from "../shared/storage-upload";
import type { UploadFileInput } from "../shared/upload-policy";
import { validateUploadFile } from "../shared/upload-policy";
import { createTimelineEvent } from "../shared/timeline";
import { createAdminNotification } from "../shared/admin-notification";

export class PortalFileUploadAccessError extends Error {
  constructor() {
    super("File upload is not allowed.");
    this.name = "PortalFileUploadAccessError";
  }
}

export class PortalFileDeleteAccessError extends Error {
  constructor() {
    super("File delete is not allowed.");
    this.name = "PortalFileDeleteAccessError";
  }
}

export class PortalRequirementSubmitAccessError extends Error {
  constructor(message = "Requirement submission is not allowed.") {
    super(message);
    this.name = "PortalRequirementSubmitAccessError";
  }
}

export type PortalUploadFileInput = {
  token: string;
  requirementId: string;
  file: UploadFileInput;
};

export type PortalSubmitRequirementInput = {
  token: string;
  requirementId: string;
};

export type PortalReviewOfficeRequirementInput = PortalSubmitRequirementInput & {
  comment?: string;
};

export type PortalDeleteUploadedFileInput = {
  token: string;
  requirementId: string;
  fileId: string;
};

async function cleanupUploadedStorageObject(input: { bucket: string; path: string }) {
  try {
    await deleteStorageObject(input);
  } catch {
    // Best-effort cleanup only. Do not expose storage details to Portal callers.
  }
}

function toPortalFileDisplayName(originalFileName: string) {
  return originalFileName.trim().split(/[\\/]/).pop()?.trim() || "上传文件";
}

function toPortalUploadedFileDTO(file: {
  id: string;
  originalFileName: string;
  mimeType: string;
  fileSize: bigint;
  createdAt: Date;
  portalDownloadable: boolean;
}): PortalFileDTO {
  return {
    id: file.id,
    displayName: toPortalFileDisplayName(file.originalFileName),
    mimeType: file.mimeType,
    fileSize: file.fileSize.toString(),
    createdAt: file.createdAt.toISOString(),
    portalDownloadable: file.portalDownloadable,
  };
}

export async function uploadPortalDocumentFile(
  input: PortalUploadFileInput,
): Promise<PortalFileDTO> {
  const tokenContext = await validatePortalToken(input.token);
  const file = validateUploadFile(input.file);

  const requirement = await prisma.caseDocumentRequirement.findUnique({
    where: { id: input.requirementId },
    select: {
      id: true,
      caseId: true,
      responsibleParty: true,
      portalVisible: true,
      title: true,
    },
  });

  if (
    !requirement ||
    requirement.caseId !== tokenContext.caseId ||
    requirement.responsibleParty !== "customer" ||
    !requirement.portalVisible
  ) {
    throw new PortalFileUploadAccessError();
  }

  const documentFileId = randomUUID();
  const storageBucket = getStorageBucketName();
  const storagePath = buildDocumentFileStoragePath({
    caseId: tokenContext.caseId,
    requirementId: requirement.id,
    documentFileId,
    extension: file.safeExtension,
  });
  const uploadedByType: ActorType = "client";

  await uploadToStorage({
    bucket: storageBucket,
    path: storagePath,
    body: file.body,
    mimeType: file.mimeType,
  });

  try {
    const documentFile = await prisma.$transaction(async (tx) => {
      const createdFile = await tx.documentFile.create({
        data: {
          id: documentFileId,
          caseId: tokenContext.caseId,
          requirementId: requirement.id,
          storageBucket,
          storagePath,
          originalFileName: file.originalFileName,
          mimeType: file.mimeType,
          fileSize: BigInt(file.fileSize),
          status: "uploaded",
          uploadedByType,
          portalVisible: true,
          portalDownloadable: true,
        },
      });

      await createTimelineEvent(
        {
          caseId: tokenContext.caseId,
          eventType: "file_uploaded",
          actorType: uploadedByType,
          summary: "File uploaded.",
          targetType: "document_file",
          targetId: createdFile.id,
          metadata: {
            fileId: createdFile.id,
            requirementId: requirement.id,
            uploadedByType,
            mimeType: file.mimeType,
            fileSize: file.fileSize,
          },
        },
        tx,
      );

      return createdFile;
    });

    return toPortalUploadedFileDTO(documentFile);
  } catch (error) {
    await cleanupUploadedStorageObject({
      bucket: storageBucket,
      path: storagePath,
    });
    throw error;
  }
}

export async function deletePortalUploadedFile(
  input: PortalDeleteUploadedFileInput,
): Promise<PortalRemovedFileDTO> {
  const tokenContext = await validatePortalToken(input.token);
  const removedAt = new Date();
  const removedByType: ActorType = "client";

  const file = await prisma.documentFile.findUnique({
    where: { id: input.fileId },
    select: {
      id: true,
      caseId: true,
      requirementId: true,
      status: true,
      uploadedByType: true,
      storageBucket: true,
      storagePath: true,
      requirement: {
        select: {
          id: true,
          caseId: true,
          responsibleParty: true,
          portalVisible: true,
          status: true,
        },
      },
    },
  });

  if (
    !file ||
    file.caseId !== tokenContext.caseId ||
    file.requirementId !== input.requirementId ||
    file.requirement.caseId !== tokenContext.caseId ||
    file.requirement.responsibleParty !== "customer" ||
    !file.requirement.portalVisible ||
    file.status !== "uploaded" ||
    file.uploadedByType !== "client" ||
    file.requirement.status !== "not_submitted" &&
    file.requirement.status !== "needs_more" &&
    file.requirement.status !== "not_applicable"
  ) {
    throw new PortalFileDeleteAccessError();
  }

  await prisma.$transaction(async (tx) => {
    await tx.documentFile.update({
      where: { id: file.id },
      data: {
        status: "removed",
        portalVisible: false,
        portalDownloadable: false,
        removedAt,
        removedByType,
      },
    });

    await createTimelineEvent(
      {
        caseId: tokenContext.caseId,
        eventType: "file_removed",
        actorType: removedByType,
        summary: "File removed.",
        targetType: "document_file",
        targetId: file.id,
        metadata: {
          fileId: file.id,
          requirementId: file.requirementId,
        },
      },
      tx,
    );
  });

  await cleanupUploadedStorageObject({
    bucket: file.storageBucket,
    path: file.storagePath,
  });

  return {
    fileId: file.id,
    requirementId: file.requirementId,
    status: "removed",
  };
}

export async function submitPortalDocumentRequirement(
  input: PortalSubmitRequirementInput,
): Promise<PortalRequirementSubmissionDTO> {
  const tokenContext = await validatePortalToken(input.token);

  const requirement = await prisma.caseDocumentRequirement.findUnique({
    where: { id: input.requirementId },
    select: {
      id: true,
      caseId: true,
      responsibleParty: true,
      portalVisible: true,
      status: true,
      title: true,
      files: {
        where: {
          status: "uploaded",
          portalVisible: true,
          uploadedByType: "client",
        },
        select: {
          id: true,
          storageBucket: true,
          storagePath: true,
        },
      },
    },
  });

  if (
    !requirement ||
    requirement.caseId !== tokenContext.caseId ||
    requirement.responsibleParty !== "customer" ||
    !requirement.portalVisible
  ) {
    throw new PortalRequirementSubmitAccessError();
  }

  if (requirement.files.length === 0) {
    throw new PortalRequirementSubmitAccessError("Please upload files before submitting.");
  }

  if (requirement.status === "approved") {
    throw new PortalRequirementSubmitAccessError();
  }

  if (requirement.status === "submitted") {
    return {
      requirementId: requirement.id,
      clientStatus: mapRequirementStatusToPortalStatus(requirement.status),
      submittedFileCount: requirement.files.length,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.caseDocumentRequirement.update({
      where: { id: requirement.id },
      data: { status: "submitted" },
    });

    await createTimelineEvent(
      {
        caseId: tokenContext.caseId,
        eventType: "requirement_status_changed",
        actorType: "client",
        summary: "Requirement submitted.",
        targetType: "case_document_requirement",
        targetId: requirement.id,
        metadata: {
          requirementId: requirement.id,
          oldStatus: requirement.status,
          newStatus: "submitted",
        },
      },
      tx,
    );

    await createAdminNotification(
      {
        caseId: tokenContext.caseId,
        type: "portal_file_uploaded",
        title: `客户提交了资料：${requirement.title}`,
        message: `客户提交了资料：${requirement.title}`,
        severity: "info",
        targetType: "case_document_requirement",
        targetId: requirement.id,
        metadata: {
          requirementId: requirement.id,
          submittedFileCount: requirement.files.length,
        },
      },
      tx,
    );
  });

  return {
    requirementId: requirement.id,
    clientStatus: "submitted",
    submittedFileCount: requirement.files.length,
  };
}

export async function withdrawPortalDocumentRequirementSubmission(
  input: PortalSubmitRequirementInput,
): Promise<PortalRequirementSubmissionDTO> {
  const tokenContext = await validatePortalToken(input.token);

  const requirement = await prisma.caseDocumentRequirement.findUnique({
    where: { id: input.requirementId },
    select: {
      id: true,
      caseId: true,
      responsibleParty: true,
      portalVisible: true,
      status: true,
      files: {
        where: {
          status: "uploaded",
          portalVisible: true,
          uploadedByType: "client",
        },
        select: {
          id: true,
          storageBucket: true,
          storagePath: true,
        },
      },
    },
  });

  if (
    !requirement ||
    requirement.caseId !== tokenContext.caseId ||
    requirement.responsibleParty !== "customer" ||
    !requirement.portalVisible ||
    requirement.status !== "submitted"
  ) {
    throw new PortalRequirementSubmitAccessError();
  }

  await prisma.$transaction(async (tx) => {
    await tx.caseDocumentRequirement.update({
      where: { id: requirement.id },
      data: { status: "not_submitted" },
    });

    if (requirement.files.length > 0) {
      await tx.documentFile.updateMany({
        where: {
          id: {
            in: requirement.files.map((file) => file.id),
          },
          status: "uploaded",
          uploadedByType: "client",
        },
        data: {
          status: "removed",
          portalVisible: false,
          portalDownloadable: false,
          removedAt: new Date(),
          removedByType: "client",
          removeReason: "withdrawn_by_client",
        },
      });

      await Promise.all(
        requirement.files.map((file) =>
          createTimelineEvent(
            {
              caseId: tokenContext.caseId,
              eventType: "file_removed",
              actorType: "client",
              summary: "File removed.",
              targetType: "document_file",
              targetId: file.id,
              metadata: {
                fileId: file.id,
                requirementId: requirement.id,
                reason: "withdrawn_by_client",
              },
            },
            tx,
          ),
        ),
      );
    }

    await createTimelineEvent(
      {
        caseId: tokenContext.caseId,
        eventType: "requirement_status_changed",
        actorType: "client",
        summary: "Requirement submission withdrawn.",
        targetType: "case_document_requirement",
        targetId: requirement.id,
        metadata: {
          requirementId: requirement.id,
          oldStatus: "submitted",
          newStatus: "not_submitted",
        },
      },
      tx,
    );
  });

  await Promise.all(
    requirement.files.map((file) =>
      cleanupUploadedStorageObject({
        bucket: file.storageBucket,
        path: file.storagePath,
      }),
    ),
  );

  return {
    requirementId: requirement.id,
    clientStatus: "not_submitted",
    submittedFileCount: 0,
  };
}

function normalizePortalReviewComment(comment: string | undefined): string | null {
  const normalized = comment?.trim();

  if (!normalized) {
    return null;
  }

  return normalized.slice(0, 1000);
}

function formatPortalReviewInternalNote(comment: string) {
  return `客户要求的说明：${comment}`;
}

export async function confirmPortalOfficeRequirement(
  input: PortalSubmitRequirementInput,
): Promise<PortalRequirementSubmissionDTO> {
  const tokenContext = await validatePortalToken(input.token);

  const requirement = await prisma.caseDocumentRequirement.findUnique({
    where: { id: input.requirementId },
    select: {
      id: true,
      caseId: true,
      responsibleParty: true,
      status: true,
      title: true,
      internalNote: true,
      files: {
        where: {
          status: "uploaded",
        },
        select: { id: true },
      },
    },
  });

  if (
    !requirement ||
    requirement.caseId !== tokenContext.caseId ||
    requirement.responsibleParty !== "office" ||
    requirement.status !== "approved"
  ) {
    throw new PortalRequirementSubmitAccessError();
  }

  await prisma.$transaction(async (tx) => {
    await tx.caseDocumentRequirement.update({
      where: { id: requirement.id },
      data: {
        status: "not_applicable",
        portalVisible: true,
        portalDownloadable: true,
      },
    });

    await createTimelineEvent(
      {
        caseId: tokenContext.caseId,
        eventType: "requirement_status_changed",
        actorType: "client",
        summary: "Office requirement confirmed by client.",
        targetType: "case_document_requirement",
        targetId: requirement.id,
        metadata: {
          requirementId: requirement.id,
          oldStatus: "approved",
          newStatus: "not_applicable",
        },
      },
      tx,
    );

    await createAdminNotification(
      {
        caseId: tokenContext.caseId,
        type: "application_confirmation_confirmed",
        title: `客户确认了事务所资料：${requirement.title}`,
        message: `客户确认了事务所资料：${requirement.title}`,
        severity: "info",
        targetType: "case_document_requirement",
        targetId: requirement.id,
        metadata: {
          requirementId: requirement.id,
        },
      },
      tx,
    );
  });

  return {
    requirementId: requirement.id,
    clientStatus: "not_applicable",
    submittedFileCount: requirement.files.length,
  };
}

export async function requestPortalOfficeRequirementRevision(
  input: PortalReviewOfficeRequirementInput,
): Promise<PortalRequirementSubmissionDTO> {
  const tokenContext = await validatePortalToken(input.token);
  const comment = normalizePortalReviewComment(input.comment);

  if (!comment) {
    throw new PortalRequirementSubmitAccessError("Please provide revision details.");
  }

  const requirement = await prisma.caseDocumentRequirement.findUnique({
    where: { id: input.requirementId },
    select: {
      id: true,
      caseId: true,
      responsibleParty: true,
      status: true,
      title: true,
      files: {
        where: {
          status: "uploaded",
        },
        select: { id: true },
      },
    },
  });

  if (
    !requirement ||
    requirement.caseId !== tokenContext.caseId ||
    requirement.responsibleParty !== "office" ||
    requirement.status !== "approved"
  ) {
    throw new PortalRequirementSubmitAccessError();
  }

  await prisma.$transaction(async (tx) => {
    await tx.caseDocumentRequirement.update({
      where: { id: requirement.id },
      data: {
        status: "submitted",
        portalVisible: true,
        portalDownloadable: false,
        internalNote: formatPortalReviewInternalNote(comment),
      },
    });

    await tx.documentFile.updateMany({
      where: {
        requirementId: requirement.id,
        status: "uploaded",
      },
      data: {
        portalVisible: false,
        portalDownloadable: false,
      },
    });

    await createTimelineEvent(
      {
        caseId: tokenContext.caseId,
        eventType: "requirement_status_changed",
        actorType: "client",
        summary: "Client requested office requirement revision.",
        targetType: "case_document_requirement",
        targetId: requirement.id,
        metadata: {
          requirementId: requirement.id,
          oldStatus: "approved",
          newStatus: "submitted",
        },
      },
      tx,
    );

    await createAdminNotification(
      {
        caseId: tokenContext.caseId,
        type: "application_confirmation_revision_requested",
        title: `客户要求修改事务所资料：${requirement.title}`,
        message: `客户要求修改事务所资料：${requirement.title}。说明：${comment}`,
        severity: "warning",
        targetType: "case_document_requirement",
        targetId: requirement.id,
        metadata: {
          requirementId: requirement.id,
        },
      },
      tx,
    );
  });

  return {
    requirementId: requirement.id,
    clientStatus: "submitted",
    submittedFileCount: requirement.files.length,
  };
}
