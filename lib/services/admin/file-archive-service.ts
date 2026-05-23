import { prisma } from "@/lib/prisma";
import { FileNotAccessibleError } from "../shared/signed-url";
import { downloadStorageObject } from "../shared/supabase-storage";
import { createZipArchive } from "../shared/zip";

export type AdminRequirementFilesArchiveResult = {
  fileName: string;
  mimeType: "application/zip";
  body: Uint8Array;
};

function getArchiveFileName(requirement: { title: string; id: string }) {
  const safeTitle = requirement.title.trim().replace(/[\\/:\0]/g, "_");
  return `${safeTitle || requirement.id}.zip`;
}

export async function createAdminRequirementFilesArchive(input: {
  requirementId: string;
}): Promise<AdminRequirementFilesArchiveResult> {
  const requirement = await prisma.caseDocumentRequirement.findUnique({
    where: { id: input.requirementId },
    select: {
      id: true,
      title: true,
      files: {
        where: { status: "uploaded" },
        orderBy: { createdAt: "asc" },
        select: {
          originalFileName: true,
          storageBucket: true,
          storagePath: true,
        },
      },
    },
  });

  if (!requirement || requirement.files.length === 0) {
    throw new FileNotAccessibleError();
  }

  const archiveFiles = await Promise.all(
    requirement.files.map(async (file) => ({
      name: file.originalFileName,
      content: await downloadStorageObject({
        bucket: file.storageBucket,
        path: file.storagePath,
      }),
    })),
  );

  return {
    fileName: getArchiveFileName(requirement),
    mimeType: "application/zip",
    body: createZipArchive(archiveFiles),
  };
}
