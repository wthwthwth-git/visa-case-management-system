import { getAllowedUploadFileTypeDescription } from "@/lib/services/shared/upload-policy";

export type ApiErrorCode =
  | "INVALID_PORTAL_TOKEN"
  | "FILE_NOT_ACCESSIBLE"
  | "CONFIRMATION_NOT_ACCESSIBLE"
  | "INVALID_UPLOAD"
  | "INVALID_REQUEST"
  | "ADMIN_AUTH_REQUIRED"
  | "ADMIN_CSRF_REQUIRED"
  | "RATE_LIMITED"
  | "SERVER_CONFIGURATION_ERROR"
  | "INTERNAL_ERROR";

export type ApiErrorResponse = {
  error: {
    code: ApiErrorCode;
    message: string;
  };
};

const errorStatusByCode: Record<ApiErrorCode, number> = {
  INVALID_PORTAL_TOKEN: 401,
  FILE_NOT_ACCESSIBLE: 404,
  CONFIRMATION_NOT_ACCESSIBLE: 404,
  INVALID_UPLOAD: 400,
  INVALID_REQUEST: 400,
  ADMIN_AUTH_REQUIRED: 401,
  ADMIN_CSRF_REQUIRED: 403,
  RATE_LIMITED: 429,
  SERVER_CONFIGURATION_ERROR: 500,
  INTERNAL_ERROR: 500,
};

const errorMessageByCode: Record<ApiErrorCode, string> = {
  INVALID_PORTAL_TOKEN: "Invalid or expired link.",
  FILE_NOT_ACCESSIBLE: "File is not accessible.",
  CONFIRMATION_NOT_ACCESSIBLE: "Application confirmation is not accessible.",
  INVALID_UPLOAD: "Invalid upload.",
  INVALID_REQUEST: "Invalid request.",
  ADMIN_AUTH_REQUIRED: "Admin authentication required.",
  ADMIN_CSRF_REQUIRED: "Invalid admin request.",
  RATE_LIMITED: "Too many requests. Please try again later.",
  SERVER_CONFIGURATION_ERROR: "Server configuration error.",
  INTERNAL_ERROR: "Something went wrong.",
};

const unsafeErrorMessagePatterns = [
  /token/i,
  /tokenHash/i,
  /storagePath/i,
  /storageBucket/i,
  /signedUrl/i,
  /session/i,
  /secret/i,
  /cookie/i,
  /authorization/i,
  /password/i,
  /\n\s*at /i,
];

const errorNameToCode: Record<string, ApiErrorCode> = {
  InvalidPortalTokenError: "INVALID_PORTAL_TOKEN",
  FileNotAccessibleError: "FILE_NOT_ACCESSIBLE",
  PortalFileUploadAccessError: "FILE_NOT_ACCESSIBLE",
  UploadPolicyError: "INVALID_UPLOAD",
  PortalApplicationConfirmationAccessError: "CONFIRMATION_NOT_ACCESSIBLE",
  InvalidPortalApplicationConfirmationInputError: "INVALID_REQUEST",
  AdminAuthNotImplementedError: "ADMIN_AUTH_REQUIRED",
  AdminAuthRequiredError: "ADMIN_AUTH_REQUIRED",
  AdminAccountDisabledError: "ADMIN_AUTH_REQUIRED",
  AdminAuthConfigurationError: "SERVER_CONFIGURATION_ERROR",
  AdminCsrfError: "ADMIN_CSRF_REQUIRED",
  RateLimitExceededError: "RATE_LIMITED",
  RateLimitConfigurationError: "SERVER_CONFIGURATION_ERROR",
  InvalidTokenReasonError: "INVALID_REQUEST",
  ActivePortalTokenExistsError: "INVALID_REQUEST",
  RequirementReviewAccessError: "INVALID_REQUEST",
  InvalidRequirementStatusTransitionError: "INVALID_REQUEST",
  InvalidRequirementReviewReasonError: "INVALID_REQUEST",
  RequirementNoteAccessError: "INVALID_REQUEST",
  InvalidRequirementNoteInputError: "INVALID_REQUEST",
  RequirementDeleteAccessError: "INVALID_REQUEST",
  CustomRequirementAccessError: "INVALID_REQUEST",
  InvalidCustomRequirementInputError: "INVALID_REQUEST",
  ImmigrationRequirementAccessError: "INVALID_REQUEST",
  InvalidImmigrationRequirementInputError: "INVALID_REQUEST",
  CasePhaseAccessError: "INVALID_REQUEST",
  InvalidCasePhaseTransitionError: "INVALID_REQUEST",
  InvalidCasePhaseMetadataError: "INVALID_REQUEST",
  InvalidApplicationConfirmationInputError: "INVALID_REQUEST",
  ApplicationConfirmationAdminError: "INVALID_REQUEST",
  AdminFileUploadAccessError: "INVALID_REQUEST",
  AdminFileUploadInputError: "INVALID_REQUEST",
  AdminFileDeleteAccessError: "INVALID_REQUEST",
  AdminFileDeleteInputError: "INVALID_REQUEST",
  InvalidCaseCreateInputError: "INVALID_REQUEST",
  CaseCreateAccessError: "INVALID_REQUEST",
  InvalidTemplateApplyInputError: "INVALID_REQUEST",
  TemplateApplyAccessError: "INVALID_REQUEST",
  TemplateAlreadyAppliedError: "INVALID_REQUEST",
  InvalidTemplateSelectionInputError: "INVALID_REQUEST",
  TemplateSelectionAccessError: "INVALID_REQUEST",
  MissingEnvironmentVariableError: "SERVER_CONFIGURATION_ERROR",
};

export function getApiErrorCode(error: unknown): ApiErrorCode {
  if (error instanceof Error) {
    return errorNameToCode[error.name] ?? "INTERNAL_ERROR";
  }

  return "INTERNAL_ERROR";
}

function getDefaultErrorMessage(code: ApiErrorCode): string {
  if (code === "INVALID_UPLOAD") {
    return `文件上传无效。允许上传的格式：${getAllowedUploadFileTypeDescription()}。`;
  }

  return errorMessageByCode[code];
}

function getSafeMessageOverride(error: unknown, code: ApiErrorCode): string | null {
  if (!(error instanceof Error) || code !== "INVALID_UPLOAD") {
    return null;
  }

  const message = error.message.trim();

  if (!message || unsafeErrorMessagePatterns.some((pattern) => pattern.test(message))) {
    return null;
  }

  return message.slice(0, 500);
}

function getRetryAfterSeconds(error: unknown): number | null {
  if (
    error instanceof Error &&
    "retryAfterSeconds" in error &&
    typeof error.retryAfterSeconds === "number"
  ) {
    return error.retryAfterSeconds;
  }

  return null;
}

export function jsonError(
  code: ApiErrorCode,
  init?: ResponseInit,
  messageOverride?: string | null,
): Response {
  return Response.json(
    {
      error: {
        code,
        message: messageOverride ?? getDefaultErrorMessage(code),
      },
    } satisfies ApiErrorResponse,
    {
      status: errorStatusByCode[code],
      ...init,
    },
  );
}

export function jsonErrorFromUnknown(error: unknown): Response {
  const code = getApiErrorCode(error);
  const retryAfterSeconds = code === "RATE_LIMITED" ? getRetryAfterSeconds(error) : null;
  const messageOverride = getSafeMessageOverride(error, code);

  if (retryAfterSeconds !== null) {
    return jsonError(code, {
      headers: {
        "Retry-After": String(retryAfterSeconds),
      },
    }, messageOverride);
  }

  return jsonError(code, undefined, messageOverride);
}
