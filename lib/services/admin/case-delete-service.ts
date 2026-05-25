import { prisma } from "@/lib/prisma";
import { deleteStorageObject } from "../shared/storage-upload";

export class CaseDeleteAccessError extends Error {
  constructor() {
    super("Case cannot be deleted.");
    this.name = "CaseDeleteAccessError";
  }
}

export type RemovedAdminCaseDTO = {
  caseId: string;
  caseNumber: string;
  removedRequirementCount: number;
  removedFileCount: number;
  removedApplicationConfirmationCount: number;
  removedAccessTokenCount: number;
};

type StoredObject = {
  storageBucket: string;
  storagePath: string;
};

async function cleanupStorageObjects(files: StoredObject[]) {
  await Promise.all(
    files.map(async (file) => {
      try {
        await deleteStorageObject({
          bucket: file.storageBucket,
          path: file.storagePath,
        });
      } catch {
        // Best-effort cleanup only. The Case delete removes DB metadata and access boundaries.
      }
    }),
  );
}

export async function removeAdminCase(input: { caseId: string }): Promise<RemovedAdminCaseDTO> {
  const visaCase = await prisma.case.findUnique({
    where: { id: input.caseId },
    select: {
      id: true,
      caseNumber: true,
      _count: {
        select: {
          documentRequirements: true,
          documentFiles: true,
          applicationConfirmations: true,
          accessTokens: true,
        },
      },
      documentFiles: {
        select: {
          storageBucket: true,
          storagePath: true,
        },
      },
      applicationConfirmations: {
        select: {
          storageBucket: true,
          storagePath: true,
        },
      },
    },
  });

  if (!visaCase) {
    throw new CaseDeleteAccessError();
  }

  await prisma.case.delete({
    where: { id: visaCase.id },
  });

  await cleanupStorageObjects([
    ...visaCase.documentFiles,
    ...visaCase.applicationConfirmations,
  ]);

  return {
    caseId: visaCase.id,
    caseNumber: visaCase.caseNumber,
    removedRequirementCount: visaCase._count.documentRequirements,
    removedFileCount: visaCase._count.documentFiles,
    removedApplicationConfirmationCount: visaCase._count.applicationConfirmations,
    removedAccessTokenCount: visaCase._count.accessTokens,
  };
}
