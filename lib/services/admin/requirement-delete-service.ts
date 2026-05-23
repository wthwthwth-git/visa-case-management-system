import { prisma } from "@/lib/prisma";
import { deleteStorageObject } from "../shared/storage-upload";

export class RequirementDeleteAccessError extends Error {
  constructor() {
    super("Requirement cannot be deleted.");
    this.name = "RequirementDeleteAccessError";
  }
}

export type RemovedRequirementDTO = {
  requirementId: string;
  removedFileCount: number;
};

async function cleanupStorageObjects(files: Array<{ storageBucket: string; storagePath: string }>) {
  await Promise.all(
    files.map(async (file) => {
      try {
        await deleteStorageObject({
          bucket: file.storageBucket,
          path: file.storagePath,
        });
      } catch {
        // Best-effort cleanup only. Deleting the requirement removes DB metadata and internal notes.
      }
    }),
  );
}

export async function removeAdminCaseDocumentRequirement(input: {
  caseId: string;
  requirementId: string;
}): Promise<RemovedRequirementDTO> {
  const requirement = await prisma.caseDocumentRequirement.findUnique({
    where: { id: input.requirementId },
    select: {
      id: true,
      caseId: true,
      files: {
        select: {
          storageBucket: true,
          storagePath: true,
        },
      },
    },
  });

  if (!requirement || requirement.caseId !== input.caseId) {
    throw new RequirementDeleteAccessError();
  }

  await prisma.caseDocumentRequirement.delete({
    where: { id: requirement.id },
  });

  await cleanupStorageObjects(requirement.files);

  return {
    requirementId: requirement.id,
    removedFileCount: requirement.files.length,
  };
}
