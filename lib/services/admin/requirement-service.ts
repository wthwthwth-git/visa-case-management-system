import { prisma } from "@/lib/prisma";
import type {
  ActorType,
  DocumentFileStatus,
  RequirementSourceType,
  RequirementStatus,
  ResponsibleParty,
} from "@prisma/client";

export type AdminDocumentFileDTO = {
  id: string;
  storageBucket: string;
  storagePath: string;
  originalFileName: string;
  mimeType: string;
  fileSize: string;
  status: DocumentFileStatus;
  uploadedByType: ActorType;
  portalVisible: boolean;
  portalDownloadable: boolean;
  removedByType: ActorType | null;
  removeReason: string | null;
  removedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminCaseRequirementDTO = {
  id: string;
  caseId: string;
  title: string;
  customerInstruction: string | null;
  internalNote: string | null;
  isRequired: boolean;
  responsibleParty: ResponsibleParty;
  sourceType: RequirementSourceType;
  status: RequirementStatus;
  sortOrder: number;
  acceptedFileTypesDescription: string | null;
  portalVisible: boolean;
  portalDownloadable: boolean;
  sourceTemplateId: string | null;
  sourceTemplateVersion: number | null;
  sourceTemplateItemId: string | null;
  immigrationRequestSource: string | null;
  requestedAt: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  files: AdminDocumentFileDTO[];
};

function toAdminDocumentFileDTO(file: {
  id: string;
  storageBucket: string;
  storagePath: string;
  originalFileName: string;
  mimeType: string;
  fileSize: bigint;
  status: DocumentFileStatus;
  uploadedByType: ActorType;
  portalVisible: boolean;
  portalDownloadable: boolean;
  removedByType: ActorType | null;
  removeReason: string | null;
  removedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): AdminDocumentFileDTO {
  return {
    id: file.id,
    storageBucket: file.storageBucket,
    storagePath: file.storagePath,
    originalFileName: file.originalFileName,
    mimeType: file.mimeType,
    fileSize: file.fileSize.toString(),
    status: file.status,
    uploadedByType: file.uploadedByType,
    portalVisible: file.portalVisible,
    portalDownloadable: file.portalDownloadable,
    removedByType: file.removedByType,
    removeReason: file.removeReason,
    removedAt: file.removedAt?.toISOString() ?? null,
    createdAt: file.createdAt.toISOString(),
    updatedAt: file.updatedAt.toISOString(),
  };
}

function toAdminCaseRequirementDTO(requirement: {
  id: string;
  caseId: string;
  title: string;
  customerInstruction: string | null;
  internalNote: string | null;
  isRequired: boolean;
  responsibleParty: ResponsibleParty;
  sourceType: RequirementSourceType;
  status: RequirementStatus;
  sortOrder: number;
  acceptedFileTypesDescription: string | null;
  portalVisible: boolean;
  portalDownloadable: boolean;
  sourceTemplateId: string | null;
  sourceTemplateVersion: number | null;
  sourceTemplateItemId: string | null;
  immigrationRequestSource: string | null;
  requestedAt: Date | null;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  files: Parameters<typeof toAdminDocumentFileDTO>[0][];
}): AdminCaseRequirementDTO {
  return {
    id: requirement.id,
    caseId: requirement.caseId,
    title: requirement.title,
    customerInstruction: requirement.customerInstruction,
    internalNote: requirement.internalNote,
    isRequired: requirement.isRequired,
    responsibleParty: requirement.responsibleParty,
    sourceType: requirement.sourceType,
    status: requirement.status,
    sortOrder: requirement.sortOrder,
    acceptedFileTypesDescription: requirement.acceptedFileTypesDescription,
    portalVisible: requirement.portalVisible,
    portalDownloadable: requirement.portalDownloadable,
    sourceTemplateId: requirement.sourceTemplateId,
    sourceTemplateVersion: requirement.sourceTemplateVersion,
    sourceTemplateItemId: requirement.sourceTemplateItemId,
    immigrationRequestSource: requirement.immigrationRequestSource,
    requestedAt: requirement.requestedAt?.toISOString() ?? null,
    dueDate: requirement.dueDate?.toISOString() ?? null,
    createdAt: requirement.createdAt.toISOString(),
    updatedAt: requirement.updatedAt.toISOString(),
    files: requirement.files.map(toAdminDocumentFileDTO),
  };
}

export async function listAdminCaseRequirements(
  caseId: string,
): Promise<AdminCaseRequirementDTO[]> {
  const requirements = await prisma.caseDocumentRequirement.findMany({
    where: { caseId },
    include: {
      files: {
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return requirements.map(toAdminCaseRequirementDTO);
}
