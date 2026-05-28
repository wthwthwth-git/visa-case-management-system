import type {
  ApplicationConfirmationStatus,
  ActorType,
  CasePhase,
  Prisma,
  ResponsibleParty,
  RequirementSourceType,
  RequirementStatus,
  TimelineEventType,
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
  sourceTemplateItemId?: string | null;
  sourceTemplateItemCustomerInstruction?: string | null;
  dueDate?: Date | null;
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
  timelineEvents?: Array<{
    eventType: TimelineEventType;
    metadata: Prisma.JsonValue | null;
    createdAt: Date;
  }>;
};

function isRequirementVisibleInPortal(requirement: PortalRequirementSource) {
  if (requirement.responsibleParty === "customer") {
    return true;
  }

  return requirement.status === "approved" || requirement.status === "not_applicable";
}

function resolvePortalCustomerInstruction(requirement: PortalRequirementSource) {
  const instruction = requirement.customerInstruction?.trim() || null;

  if (
    requirement.responsibleParty === "office" &&
    requirement.sourceType === "template" &&
    instruction &&
    requirement.sourceTemplateItemCustomerInstruction?.trim() === instruction
  ) {
    return null;
  }

  return instruction;
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
    customerInstruction: resolvePortalCustomerInstruction(requirement),
    dueDate: requirement.dueDate?.toISOString() ?? null,
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

function getTimelineMetadataString(
  metadata: Prisma.JsonValue | null,
  key: "submittedAt" | "submissionNumber",
) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as Record<string, Prisma.JsonValue>)[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toPortalSubmissionInfo(events: PortalCaseSource["timelineEvents"]) {
  for (const event of events ?? []) {
    if (event.eventType !== "case_phase_changed") {
      continue;
    }

    const submittedAt = getTimelineMetadataString(event.metadata, "submittedAt");
    const submissionNumber = getTimelineMetadataString(event.metadata, "submissionNumber");

    if (submittedAt || submissionNumber) {
      return {
        submittedAt,
        submissionNumber,
      };
    }
  }

  return null;
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
    submissionInfo: toPortalSubmissionInfo(visaCase.timelineEvents),
    requirements,
    applicationConfirmations,
  };
}
