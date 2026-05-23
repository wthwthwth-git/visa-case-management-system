import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { ActorType } from "@prisma/client";
import type { PortalFileDTO } from "../types";
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

export class PortalFileUploadAccessError extends Error {
  constructor() {
    super("File upload is not allowed.");
    this.name = "PortalFileUploadAccessError";
  }
}

export type PortalUploadFileInput = {
  token: string;
  requirementId: string;
  file: UploadFileInput;
};

async function cleanupUploadedStorageObject(input: { bucket: string; path: string }) {
  try {
    await deleteStorageObject(input);
  } catch {
    // Best-effort cleanup only. Do not expose storage details to Portal callers.
  }
}

function toPortalUploadedFileDTO(file: {
  id: string;
  mimeType: string;
  fileSize: bigint;
  createdAt: Date;
  portalDownloadable: boolean;
}): PortalFileDTO {
  return {
    id: file.id,
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
      status: true,
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

      if (requirement.status === "not_submitted") {
        await tx.caseDocumentRequirement.update({
          where: { id: requirement.id },
          data: { status: "submitted" },
        });
      }

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
