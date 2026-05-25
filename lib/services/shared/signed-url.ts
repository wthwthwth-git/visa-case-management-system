import { prisma } from "@/lib/prisma";
import { validatePortalToken } from "../portal/portal-token-service";
import { createStorageSignedUrl } from "./supabase-storage";

export type SignedUrlResult = {
  signedUrl: string;
  expiresAt: Date;
};

export class FileNotAccessibleError extends Error {
  constructor() {
    super("File not accessible.");
    this.name = "FileNotAccessibleError";
  }
}

function getExpiresAt(expiresInSeconds: number) {
  return new Date(Date.now() + expiresInSeconds * 1000);
}

async function createSignedUrlResult(input: {
  storageBucket: string;
  storagePath: string;
  expiresInSeconds: number;
}): Promise<SignedUrlResult> {
  const signedUrl = await createStorageSignedUrl({
    bucket: input.storageBucket,
    path: input.storagePath,
    expiresInSeconds: input.expiresInSeconds,
  });

  return {
    signedUrl,
    expiresAt: getExpiresAt(input.expiresInSeconds),
  };
}

function getPortalExpiresInSeconds() {
  const rawValue = process.env.STORAGE_SIGNED_URL_EXPIRES_IN_SECONDS;

  if (!rawValue) {
    return 300;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 300;
}

export async function createAdminFileSignedUrl(input: {
  fileId: string;
}): Promise<SignedUrlResult> {
  const file = await prisma.documentFile.findUnique({
    where: { id: input.fileId },
    select: {
      storageBucket: true,
      storagePath: true,
      status: true,
    },
  });

  if (!file || file.status !== "uploaded") {
    throw new FileNotAccessibleError();
  }

  return createSignedUrlResult({
    storageBucket: file.storageBucket,
    storagePath: file.storagePath,
    expiresInSeconds: 900,
  });
}

export async function createPortalFileSignedUrl(input: {
  token: string;
  fileId: string;
}): Promise<SignedUrlResult> {
  let tokenContext: Awaited<ReturnType<typeof validatePortalToken>>;

  try {
    tokenContext = await validatePortalToken(input.token);
  } catch {
    throw new FileNotAccessibleError();
  }

  const file = await prisma.documentFile.findUnique({
    where: { id: input.fileId },
    include: {
      requirement: true,
    },
  });

  if (!file) {
    throw new FileNotAccessibleError();
  }

  const isCompletedOfficeRequirement =
    file.requirement.responsibleParty === "office" && file.requirement.status === "approved";

  const isAccessible =
    file.caseId === tokenContext.caseId &&
    file.requirement.caseId === tokenContext.caseId &&
    file.requirementId === file.requirement.id &&
    file.status === "uploaded" &&
    ((file.requirement.portalVisible &&
      file.portalVisible &&
      file.portalDownloadable &&
      (file.uploadedByType === "client" || file.requirement.portalDownloadable)) ||
      isCompletedOfficeRequirement);

  if (!isAccessible) {
    throw new FileNotAccessibleError();
  }

  return createSignedUrlResult({
    storageBucket: file.storageBucket,
    storagePath: file.storagePath,
    expiresInSeconds: getPortalExpiresInSeconds(),
  });
}
