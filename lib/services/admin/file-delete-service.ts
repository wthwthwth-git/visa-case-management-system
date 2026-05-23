import { prisma } from "@/lib/prisma";
import type { ActorType } from "@prisma/client";
import { deleteStorageObject } from "../shared/storage-upload";
import { createTimelineEvent } from "../shared/timeline";

const maxReasonLength = 500;
const unsafeReasonPattern =
  /(token|tokenHash|plaintextToken|signedUrl|storagePath|storageBucket|originalFileName|passport|residenceCard|https?:\/\/|x-amz-signature)/i;

export class AdminFileDeleteAccessError extends Error {
  constructor() {
    super("File delete is not allowed.");
    this.name = "AdminFileDeleteAccessError";
  }
}

export class AdminFileDeleteInputError extends Error {
  constructor(message = "Invalid file delete input.") {
    super(message);
    this.name = "AdminFileDeleteInputError";
  }
}

export type RemovedAdminDocumentFileDTO = {
  fileId: string;
  requirementId: string;
  status: "removed";
  removedAt: string;
};

export type RemovedAdminRequirementFilesDTO = {
  requirementId: string;
  removedFileIds: string[];
  removedCount: number;
};

function normalizeReason(reason: string | undefined) {
  if (reason === undefined) {
    return undefined;
  }

  const normalized = reason.trim();

  if (normalized.length === 0) {
    return undefined;
  }

  if (normalized.length > maxReasonLength) {
    throw new AdminFileDeleteInputError("File delete reason must be 500 characters or fewer.");
  }

  if (unsafeReasonPattern.test(normalized)) {
    throw new AdminFileDeleteInputError("File delete reason contains unsafe content.");
  }

  return normalized;
}

async function cleanupStorageObjects(files: Array<{ storageBucket: string; storagePath: string }>) {
  await Promise.all(
    files.map(async (file) => {
      try {
        await deleteStorageObject({
          bucket: file.storageBucket,
          path: file.storagePath,
        });
      } catch {
        // Best-effort cleanup only. The database removal state is the source of truth.
      }
    }),
  );
}

function buildFileRemovedMetadata(input: {
  fileId: string;
  requirementId: string;
  reason?: string;
}) {
  return {
    fileId: input.fileId,
    requirementId: input.requirementId,
    ...(input.reason === undefined ? {} : { reason: input.reason }),
  };
}

function toRemovedFileDTO(file: {
  id: string;
  requirementId: string;
  removedAt: Date | null;
}): RemovedAdminDocumentFileDTO {
  return {
    fileId: file.id,
    requirementId: file.requirementId,
    status: "removed",
    removedAt: (file.removedAt ?? new Date()).toISOString(),
  };
}

export async function removeAdminDocumentFile(input: {
  fileId: string;
  reason?: string;
}): Promise<RemovedAdminDocumentFileDTO> {
  const reason = normalizeReason(input.reason);
  const removedAt = new Date();
  const removedByType: ActorType = "internal";

  const existingFile = await prisma.documentFile.findUnique({
    where: { id: input.fileId },
    select: {
      id: true,
      caseId: true,
      requirementId: true,
      status: true,
      storageBucket: true,
      storagePath: true,
    },
  });

  if (!existingFile || existingFile.status !== "uploaded") {
    throw new AdminFileDeleteAccessError();
  }

  const removedFile = await prisma.$transaction(async (tx) => {
    const updatedFile = await tx.documentFile.update({
      where: { id: existingFile.id },
      data: {
        status: "removed",
        portalVisible: false,
        portalDownloadable: false,
        removedAt,
        removedByType,
        removeReason: reason ?? null,
      },
      select: {
        id: true,
        requirementId: true,
        status: true,
        removedAt: true,
      },
    });

    await createTimelineEvent(
      {
        caseId: existingFile.caseId,
        eventType: "file_removed",
        actorType: removedByType,
        summary: "File removed.",
        targetType: "document_file",
        targetId: existingFile.id,
        metadata: buildFileRemovedMetadata({
          fileId: existingFile.id,
          requirementId: existingFile.requirementId,
          reason,
        }),
      },
      tx,
    );

    return updatedFile;
  });

  await cleanupStorageObjects([existingFile]);

  return toRemovedFileDTO(removedFile);
}

export async function removeAdminRequirementUploadedFiles(input: {
  requirementId: string;
  reason?: string;
}): Promise<RemovedAdminRequirementFilesDTO> {
  const reason = normalizeReason(input.reason);
  const removedAt = new Date();
  const removedByType: ActorType = "internal";

  const requirement = await prisma.caseDocumentRequirement.findUnique({
    where: { id: input.requirementId },
    select: {
      id: true,
      caseId: true,
      files: {
        where: { status: "uploaded" },
        select: {
          id: true,
          requirementId: true,
          storageBucket: true,
          storagePath: true,
        },
      },
    },
  });

  if (!requirement) {
    throw new AdminFileDeleteAccessError();
  }

  if (requirement.files.length === 0) {
    return {
      requirementId: input.requirementId,
      removedFileIds: [],
      removedCount: 0,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.documentFile.updateMany({
      where: {
        requirementId: requirement.id,
        status: "uploaded",
      },
      data: {
        status: "removed",
        portalVisible: false,
        portalDownloadable: false,
        removedAt,
        removedByType,
        removeReason: reason ?? null,
      },
    });

    await Promise.all(
      requirement.files.map((file) =>
        createTimelineEvent(
          {
            caseId: requirement.caseId,
            eventType: "file_removed",
            actorType: removedByType,
            summary: "File removed.",
            targetType: "document_file",
            targetId: file.id,
            metadata: buildFileRemovedMetadata({
              fileId: file.id,
              requirementId: requirement.id,
              reason,
            }),
          },
          tx,
        ),
      ),
    );
  });

  await cleanupStorageObjects(requirement.files);

  return {
    requirementId: requirement.id,
    removedFileIds: requirement.files.map((file) => file.id),
    removedCount: requirement.files.length,
  };
}
