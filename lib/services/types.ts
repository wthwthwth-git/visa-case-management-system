import type {
  ApplicationConfirmationStatus,
  CasePhase,
  Prisma,
  RequirementSourceType,
  RequirementStatus,
  TimelineEventType,
  TimelineTargetType,
  ActorType,
} from "@prisma/client";

export type PortalDocumentStatus =
  | "not_submitted"
  | "submitted"
  | "needs_more"
  | "accepted"
  | "not_applicable";

export type PortalFileDTO = {
  id: string;
  mimeType: string;
  fileSize: string;
  createdAt: string;
  portalDownloadable: boolean;
};

export type PortalRequirementDTO = {
  id: string;
  title: string;
  customerInstruction: string | null;
  isRequired: boolean;
  clientStatus: PortalDocumentStatus;
  sourceType: RequirementSourceType;
  files: PortalFileDTO[];
};

export type PortalApplicationConfirmationDTO = {
  id: string;
  title: string;
  version: number;
  status: ApplicationConfirmationStatus;
};

export type PortalCaseDTO = {
  caseId: string;
  caseNumber: string;
  customerName: string;
  targetVisaType: string;
  casePhase: CasePhase;
  requirements: PortalRequirementDTO[];
  applicationConfirmations: PortalApplicationConfirmationDTO[];
};

export type PortalTokenContext = {
  tokenId: string;
  caseId: string;
};

export type CreateTimelineEventInput = {
  caseId?: string | null;
  eventType: TimelineEventType;
  actorType: ActorType;
  summary: string;
  targetType?: TimelineTargetType | null;
  targetId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export function mapRequirementStatusToPortalStatus(
  status: RequirementStatus,
): PortalDocumentStatus {
  switch (status) {
    case "approved":
      return "accepted";
    case "not_submitted":
    case "submitted":
    case "needs_more":
    case "not_applicable":
      return status;
  }
}
