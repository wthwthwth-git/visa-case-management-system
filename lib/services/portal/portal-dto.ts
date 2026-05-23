import type {
  ApplicationConfirmationStatus,
  CasePhase,
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
  portalDownloadable: boolean;
};

export type PortalRequirementSource = {
  id: string;
  title: string;
  customerInstruction: string | null;
  isRequired: boolean;
  status: RequirementStatus;
  sourceType: RequirementSourceType;
  portalDownloadable: boolean;
  files: PortalFileSource[];
};

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

export function toPortalRequirementDTO(
  requirement: PortalRequirementSource,
): PortalRequirementDTO {
  return {
    id: requirement.id,
    title: requirement.title,
    customerInstruction: requirement.customerInstruction,
    isRequired: requirement.isRequired,
    clientStatus: mapRequirementStatusToPortalStatus(requirement.status),
    sourceType: requirement.sourceType,
    files: requirement.files.map(
      (file): PortalFileDTO => ({
        id: file.id,
        mimeType: file.mimeType,
        fileSize: file.fileSize.toString(),
        createdAt: file.createdAt.toISOString(),
        portalDownloadable: file.portalDownloadable && requirement.portalDownloadable,
      }),
    ),
  };
}

export function toPortalCaseDTO(visaCase: PortalCaseSource): PortalCaseDTO {
  const requirements: PortalRequirementDTO[] =
    visaCase.documentRequirements.map(toPortalRequirementDTO);

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
