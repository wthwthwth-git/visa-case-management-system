"use client";

export type PortalDocumentStatus =
  | "not_submitted"
  | "submitted"
  | "needs_more"
  | "accepted"
  | "not_applicable";

export type PortalFile = {
  id: string;
  displayName: string;
  mimeType: string;
  fileSize: string;
  createdAt: string;
  portalDownloadable: boolean;
};

export type PortalRequirement = {
  id: string;
  title: string;
  customerInstruction: string | null;
  isRequired: boolean;
  responsibleParty: "customer" | "office";
  clientStatus: PortalDocumentStatus;
  sourceType: string;
  files: PortalFile[];
};

export type PortalRequirementSubmission = {
  requirementId: string;
  clientStatus: PortalDocumentStatus;
  submittedFileCount: number;
};

export type PortalRemovedFile = {
  fileId: string;
  requirementId: string;
  status: "removed";
};

export type PortalApplicationConfirmation = {
  id: string;
  title: string;
  version: number;
  status: "pending" | "confirmed" | "needs_revision" | "superseded";
};

export type PortalCase = {
  caseId: string;
  caseNumber: string;
  customerName: string;
  targetVisaType: string;
  casePhase: string;
  requirements: PortalRequirement[];
  applicationConfirmations: PortalApplicationConfirmation[];
};

export type ImmediateAccessUrl = {
  accessUrl: string;
  expiresAt: string;
};

type ApiSuccess<T> = {
  data: T;
};

type ApiFailure = {
  error: {
    code: string;
    message: string;
  };
};

export class PortalApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PortalApiError";
    this.code = code;
  }
}

async function parsePortalResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | ApiSuccess<T>
    | ApiFailure
    | null;

  if (!response.ok || !payload || "error" in payload) {
    if (payload && "error" in payload) {
      throw new PortalApiError(payload.error.code, payload.error.message);
    }

    throw new PortalApiError("INTERNAL_ERROR", "Request failed.");
  }

  return payload.data;
}

function portalPath(token: string, suffix: string) {
  return `/api/portal/${encodeURIComponent(token)}${suffix}`;
}

export async function fetchPortalCase(token: string): Promise<PortalCase> {
  const response = await fetch(portalPath(token, "/case"), {
    method: "GET",
    cache: "no-store",
  });

  return parsePortalResponse<PortalCase>(response);
}

export async function uploadPortalRequirementFile(input: {
  token: string;
  requirementId: string;
  file: File;
}): Promise<PortalFile> {
  const formData = new FormData();
  formData.append("file", input.file);

  const response = await fetch(
    portalPath(input.token, `/requirements/${encodeURIComponent(input.requirementId)}/files`),
    {
      method: "POST",
      body: formData,
    },
  );

  return parsePortalResponse<PortalFile>(response);
}

export async function submitPortalRequirement(input: {
  token: string;
  requirementId: string;
}): Promise<PortalRequirementSubmission> {
  const response = await fetch(
    portalPath(input.token, `/requirements/${encodeURIComponent(input.requirementId)}/submit`),
    {
      method: "POST",
    },
  );

  return parsePortalResponse<PortalRequirementSubmission>(response);
}

export async function withdrawPortalRequirement(input: {
  token: string;
  requirementId: string;
}): Promise<PortalRequirementSubmission> {
  const response = await fetch(
    portalPath(input.token, `/requirements/${encodeURIComponent(input.requirementId)}/withdraw`),
    {
      method: "POST",
    },
  );

  return parsePortalResponse<PortalRequirementSubmission>(response);
}

export async function confirmPortalOfficeRequirement(input: {
  token: string;
  requirementId: string;
}): Promise<PortalRequirementSubmission> {
  const response = await fetch(
    portalPath(input.token, `/requirements/${encodeURIComponent(input.requirementId)}/confirm`),
    {
      method: "POST",
    },
  );

  return parsePortalResponse<PortalRequirementSubmission>(response);
}

export async function requestPortalOfficeRequirementRevision(input: {
  token: string;
  requirementId: string;
  comment?: string;
}): Promise<PortalRequirementSubmission> {
  const response = await fetch(
    portalPath(
      input.token,
      `/requirements/${encodeURIComponent(input.requirementId)}/request-revision`,
    ),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        comment: cleanOptionalString(input.comment),
      }),
    },
  );

  return parsePortalResponse<PortalRequirementSubmission>(response);
}

export async function deletePortalRequirementFile(input: {
  token: string;
  requirementId: string;
  fileId: string;
}): Promise<PortalRemovedFile> {
  const response = await fetch(
    portalPath(
      input.token,
      `/requirements/${encodeURIComponent(input.requirementId)}/files/${encodeURIComponent(
        input.fileId,
      )}`,
    ),
    {
      method: "DELETE",
    },
  );

  return parsePortalResponse<PortalRemovedFile>(response);
}

async function requestImmediateAccessUrl(path: string): Promise<ImmediateAccessUrl> {
  const response = await fetch(path, {
    method: "POST",
  });
  const data = await parsePortalResponse<{ signedUrl: string; expiresAt: string }>(response);

  return {
    accessUrl: data.signedUrl,
    expiresAt: data.expiresAt,
  };
}

export async function createPortalFileAccessUrl(input: {
  token: string;
  fileId: string;
}): Promise<ImmediateAccessUrl> {
  return requestImmediateAccessUrl(
    portalPath(input.token, `/files/${encodeURIComponent(input.fileId)}/signed-url`),
  );
}

export async function createPortalApplicationConfirmationAccessUrl(input: {
  token: string;
  confirmationId: string;
}): Promise<ImmediateAccessUrl> {
  return requestImmediateAccessUrl(
    portalPath(
      input.token,
      `/application-confirmations/${encodeURIComponent(input.confirmationId)}/signed-url`,
    ),
  );
}

export async function confirmPortalApplicationConfirmation(input: {
  token: string;
  confirmationId: string;
  reason?: string;
}): Promise<PortalApplicationConfirmation> {
  const response = await fetch(
    portalPath(
      input.token,
      `/application-confirmations/${encodeURIComponent(input.confirmationId)}/confirm`,
    ),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reason: cleanOptionalString(input.reason),
      }),
    },
  );

  return parsePortalResponse<PortalApplicationConfirmation>(response);
}

export async function requestPortalApplicationConfirmationRevision(input: {
  token: string;
  confirmationId: string;
  comment?: string;
  reason?: string;
}): Promise<PortalApplicationConfirmation> {
  const response = await fetch(
    portalPath(
      input.token,
      `/application-confirmations/${encodeURIComponent(input.confirmationId)}/request-revision`,
    ),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        comment: cleanOptionalString(input.comment),
        reason: cleanOptionalString(input.reason),
      }),
    },
  );

  return parsePortalResponse<PortalApplicationConfirmation>(response);
}

function cleanOptionalString(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function toPortalErrorMessage(error: unknown): string {
  const code = error instanceof PortalApiError ? error.code : null;
  const apiMessage = error instanceof PortalApiError ? error.message.trim() : "";

  switch (code) {
    case "INVALID_PORTAL_TOKEN":
      return "链接无效或已过期，请联系事务所。";
    case "RATE_LIMITED":
      return "操作过于频繁，请稍后再试。";
    case "FILE_NOT_ACCESSIBLE":
      return "文件暂时无法访问，请联系事务所。";
    case "CONFIRMATION_NOT_ACCESSIBLE":
      return "完成资料暂时无法访问，请联系事务所。";
    case "INVALID_UPLOAD":
      if (
        apiMessage &&
        apiMessage !== "Invalid upload." &&
        (apiMessage.includes("允许上传") || apiMessage.includes("文件"))
      ) {
        return apiMessage;
      }

      return "文件格式或大小不符合要求。";
    case "INVALID_REQUEST":
      return "提交内容有误，请检查后再试。";
    case "SERVER_CONFIGURATION_ERROR":
      return "服务配置暂时不可用，请联系事务所。";
    default:
      return "发生错误，请稍后再试或联系事务所。";
  }
}
export function formatPortalDateTime(value: string | null): string {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
