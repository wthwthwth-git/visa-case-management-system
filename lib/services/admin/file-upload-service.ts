import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { ActorType, RequirementSourceType, ResponsibleParty } from "@prisma/client";
import { buildDocumentFileStoragePath } from "../shared/storage-path";
import {
  deleteStorageObject,
  getStorageBucketName,
  uploadToStorage,
} from "../shared/storage-upload";
import { createTimelineEvent } from "../shared/timeline";
import type { UploadFileInput } from "../shared/upload-policy";
import { validateUploadFile } from "../shared/upload-policy";

export class AdminFileUploadAccessError extends Error {
  constructor() {
    super("File upload is not allowed.");
    this.name = "AdminFileUploadAccessError";
  }
}

export type AdminUploadFileInput = {
  caseId: string;
  requirementId: string;
  file: UploadFileInput;
};

export type AdminUploadedFileDTO = {
  id: string;
  requirementId: string;
  originalFileName: string;
  mimeType: string;
  fileSize: string;
  status: "uploaded" | "removed" | "replaced";
  uploadedByType: ActorType;
  portalVisible: boolean;
  portalDownloadable: boolean;
  createdAt: string;
};

async function cleanupUploadedStorageObject(input: { bucket: string; path: string }) {
  try {
    await deleteStorageObject(input);
  } catch {
    // Best-effort cleanup only. The original DB error should remain the visible failure.
  }
}

function defaultFileVisibility(requirement: {
  responsibleParty: ResponsibleParty;
  sourceType: RequirementSourceType;
}) {
  if (
    requirement.responsibleParty === "customer" &&
    requirement.sourceType !== "immigration_request"
  ) {
    return {
      portalVisible: true,
      portalDownloadable: true,
    };
  }

  return {
    portalVisible: false,
    portalDownloadable: false,
  };
}

function toAdminUploadedFileDTO(file: {
  id: string;
  requirementId: string;
  originalFileName: string;
  mimeType: string;
  fileSize: bigint;
  status: "uploaded" | "removed" | "replaced";
  uploadedByType: ActorType;
  portalVisible: boolean;
  portalDownloadable: boolean;
  createdAt: Date;
}): AdminUploadedFileDTO {
  return {
    id: file.id,
    requirementId: file.requirementId,
    originalFileName: file.originalFileName,
    mimeType: file.mimeType,
    fileSize: file.fileSize.toString(),
    status: file.status,
    uploadedByType: file.uploadedByType,
    portalVisible: file.portalVisible,
    portalDownloadable: file.portalDownloadable,
    createdAt: file.createdAt.toISOString(),
  };
}

export async function uploadAdminDocumentFile(
  input: AdminUploadFileInput,
): Promise<AdminUploadedFileDTO> {
  const file = validateUploadFile(input.file);

  const requirement = await prisma.caseDocumentRequirement.findUnique({
    where: { id: input.requirementId },
    select: {
      id: true,
      caseId: true,
      responsibleParty: true,
      sourceType: true,
      status: true,
    },
  });

  if (!requirement || requirement.caseId !== input.caseId) {
    throw new AdminFileUploadAccessError();
  }

  const documentFileId = randomUUID();
  const storageBucket = getStorageBucketName();
  const storagePath = buildDocumentFileStoragePath({
    caseId: input.caseId,
    requirementId: requirement.id,
    documentFileId,
    extension: file.safeExtension,
  });
  const uploadedByType: ActorType = "internal";
  const visibility = defaultFileVisibility(requirement);

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
          caseId: input.caseId,
          requirementId: requirement.id,
          storageBucket,
          storagePath,
          originalFileName: file.originalFileName,
          mimeType: file.mimeType,
          fileSize: BigInt(file.fileSize),
          status: "uploaded",
          uploadedByType,
          portalVisible: visibility.portalVisible,
          portalDownloadable: visibility.portalDownloadable,
        },
      });

      if (requirement.status === "not_submitted") {
        await tx.caseDocumentRequirement.update({
          where: { id: requirement.id },
          data: { status: "submitted" },
        });
      }

      await createTimelineEvent(
        {
          caseId: input.caseId,
          eventType: "file_uploaded",
          actorType: uploadedByType,
          summary: "文件已上传",
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

    return toAdminUploadedFileDTO(documentFile);
  } catch (error) {
    await cleanupUploadedStorageObject({
      bucket: storageBucket,
      path: storagePath,
    });
    throw error;
  }
}
