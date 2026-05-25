import type {
  ApplicationConfirmationStatus,
  ActorType,
  CasePhase,
  ResponsibleParty,
  RequirementSourceType,
  RequirementStatus,
} from "@prisma/client";
import {
  mapRequirementStatusToPortalStatus,
  type PortalApplicationConfirmationDTO,
  type PortalCaseDTO,
  type PortalFileDTO,
  type PortalRequirementDTO,
} from "../types";

export type PortalFileSource = {
  id: string;
  originalFileName: string;
  mimeType: string;
  fileSize: bigint | number | string;
  createdAt: Date;
  uploadedByType: ActorType;
  portalVisible: boolean;
  portalDownloadable: boolean;
};

export type PortalRequirementSource = {
  id: string;
  title: string;
  customerInstruction: string | null;
  isRequired: boolean;
  responsibleParty: ResponsibleParty;
  status: RequirementStatus;
  sourceType: RequirementSourceType;
  portalDownloadable: boolean;
  files: PortalFileSource[];
};

function toPortalFileDisplayName(originalFileName: string) {
  const trimmed = originalFileName.trim();
  const withoutPath = trimmed.split(/[\\/]/).pop()?.trim();

  return withoutPath || "上传文件";
}

export type PortalApplicationConfirmationSource = {
  id: string;
  title: string;
  version: number;
  status: ApplicationConfirmationStatus;
};

export type PortalCaseSource = {
  id: string;
  caseNumber: string;
  targetVisaType: string;
  casePhase: CasePhase;
  customer: {
    name: string;
  };
  documentRequirements: PortalRequirementSource[];
  applicationConfirmations: PortalApplicationConfirmationSource[];
};

function isRequirementVisibleInPortal(requirement: PortalRequirementSource) {
  if (requirement.responsibleParty === "customer") {
    return true;
  }

  return requirement.status === "approved" || requirement.status === "not_applicable";
}

export function toPortalRequirementDTO(
  requirement: PortalRequirementSource,
): PortalRequirementDTO {
  const isCompletedOfficeRequirement =
    requirement.responsibleParty === "office" &&
    (requirement.status === "approved" || requirement.status === "not_applicable");
  const visibleFiles =
    requirement.responsibleParty === "office"
      ? isCompletedOfficeRequirement
        ? requirement.files
        : []
      : requirement.files.filter((file) => file.portalVisible);

  return {
    id: requirement.id,
    title: requirement.title,
    customerInstruction: requirement.customerInstruction,
    isRequired: requirement.isRequired,
    responsibleParty: requirement.responsibleParty,
    clientStatus: mapRequirementStatusToPortalStatus(requirement.status),
    sourceType: requirement.sourceType,
    files: visibleFiles.map(
      (file): PortalFileDTO => ({
        id: file.id,
        displayName: toPortalFileDisplayName(file.originalFileName),
        mimeType: file.mimeType,
        fileSize: file.fileSize.toString(),
        createdAt: file.createdAt.toISOString(),
        portalDownloadable:
          isCompletedOfficeRequirement ||
          (file.portalDownloadable &&
            (file.uploadedByType === "client" || requirement.portalDownloadable)),
      }),
    ),
  };
}

export function toPortalCaseDTO(visaCase: PortalCaseSource): PortalCaseDTO {
  const requirements: PortalRequirementDTO[] = visaCase.documentRequirements
    .filter(isRequirementVisibleInPortal)
    .map(toPortalRequirementDTO);

  const applicationConfirmations: PortalApplicationConfirmationDTO[] =
    visaCase.applicationConfirmations.map((confirmation) => ({
      id: confirmation.id,
      title: confirmation.title,
      version: confirmation.version,
      status: confirmation.status,
    }));

  return {
    caseId: visaCase.id,
    caseNumber: visaCase.caseNumber,
    customerName: visaCase.customer.name,
    targetVisaType: visaCase.targetVisaType,
    casePhase: visaCase.casePhase,
    requirements,
    applicationConfirmations,
  };
}
