import { describe, expect, it } from "vitest";
import { getApiErrorCode, jsonError, jsonErrorFromUnknown } from "./errors";

function namedError(name: string) {
  const error = new Error("sensitive message with storagePath and tokenHash");
  error.name = name;
  return error;
}

describe("api error helper", () => {
  it.each([
    ["InvalidPortalTokenError", "INVALID_PORTAL_TOKEN"],
    ["FileNotAccessibleError", "FILE_NOT_ACCESSIBLE"],
    ["PortalFileUploadAccessError", "FILE_NOT_ACCESSIBLE"],
    ["UploadPolicyError", "INVALID_UPLOAD"],
    ["PortalApplicationConfirmationAccessError", "CONFIRMATION_NOT_ACCESSIBLE"],
    ["InvalidPortalApplicationConfirmationInputError", "INVALID_REQUEST"],
    ["AdminAuthNotImplementedError", "ADMIN_AUTH_REQUIRED"],
    ["AdminAuthRequiredError", "ADMIN_AUTH_REQUIRED"],
    ["AdminAccountDisabledError", "ADMIN_AUTH_REQUIRED"],
    ["AdminAuthConfigurationError", "SERVER_CONFIGURATION_ERROR"],
    ["AdminCsrfError", "ADMIN_CSRF_REQUIRED"],
    ["RateLimitExceededError", "RATE_LIMITED"],
    ["RateLimitConfigurationError", "SERVER_CONFIGURATION_ERROR"],
    ["InvalidTokenReasonError", "INVALID_REQUEST"],
    ["ActivePortalTokenExistsError", "INVALID_REQUEST"],
    ["RequirementReviewAccessError", "INVALID_REQUEST"],
    ["InvalidRequirementStatusTransitionError", "INVALID_REQUEST"],
    ["InvalidRequirementReviewReasonError", "INVALID_REQUEST"],
    ["ImmigrationRequirementAccessError", "INVALID_REQUEST"],
    ["InvalidImmigrationRequirementInputError", "INVALID_REQUEST"],
    ["CasePhaseAccessError", "INVALID_REQUEST"],
    ["InvalidCasePhaseTransitionError", "INVALID_REQUEST"],
    ["InvalidCasePhaseMetadataError", "INVALID_REQUEST"],
    ["InvalidApplicationConfirmationInputError", "INVALID_REQUEST"],
    ["ApplicationConfirmationAdminError", "INVALID_REQUEST"],
    ["AdminFileUploadAccessError", "INVALID_REQUEST"],
    ["AdminFileUploadInputError", "INVALID_REQUEST"],
    ["InvalidCaseCreateInputError", "INVALID_REQUEST"],
    ["CaseCreateAccessError", "INVALID_REQUEST"],
    ["InvalidTemplateApplyInputError", "INVALID_REQUEST"],
    ["TemplateApplyAccessError", "INVALID_REQUEST"],
    ["TemplateAlreadyAppliedError", "INVALID_REQUEST"],
    ["InvalidTemplateSelectionInputError", "INVALID_REQUEST"],
    ["TemplateSelectionAccessError", "INVALID_REQUEST"],
    ["MissingEnvironmentVariableError", "SERVER_CONFIGURATION_ERROR"],
    ["UnknownError", "INTERNAL_ERROR"],
  ] as const)("maps %s to %s", (name, code) => {
    expect(getApiErrorCode(namedError(name))).toBe(code);
  });

  it("returns safe error messages without leaking original error details", async () => {
    const response = jsonErrorFromUnknown(namedError("UnknownError"));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong.",
      },
    });
    expect(JSON.stringify(payload)).not.toContain("storagePath");
    expect(JSON.stringify(payload)).not.toContain("tokenHash");
  });

  it("returns controlled upload policy guidance without leaking unsafe upload error details", async () => {
    const safeUploadError = new Error("文件格式不符合要求。允许上传：PDF、Word (.docx)、Excel (.xlsx)、TXT。");
    safeUploadError.name = "UploadPolicyError";

    const safeResponse = jsonErrorFromUnknown(safeUploadError);
    const safePayload = await safeResponse.json();

    expect(safeResponse.status).toBe(400);
    expect(safePayload).toEqual({
      error: {
        code: "INVALID_UPLOAD",
        message: "文件格式不符合要求。允许上传：PDF、Word (.docx)、Excel (.xlsx)、TXT。",
      },
    });

    const unsafeUploadError = namedError("UploadPolicyError");
    const unsafeResponse = jsonErrorFromUnknown(unsafeUploadError);
    const unsafePayload = await unsafeResponse.json();

    expect(unsafeResponse.status).toBe(400);
    expect(unsafePayload.error.code).toBe("INVALID_UPLOAD");
    expect(unsafePayload.error.message).toContain("允许上传的格式");
    expect(JSON.stringify(unsafePayload)).not.toContain("storagePath");
    expect(JSON.stringify(unsafePayload)).not.toContain("tokenHash");
  });

  it("uses configured status codes", () => {
    expect(jsonError("INVALID_PORTAL_TOKEN").status).toBe(401);
    expect(jsonError("FILE_NOT_ACCESSIBLE").status).toBe(404);
    expect(jsonError("CONFIRMATION_NOT_ACCESSIBLE").status).toBe(404);
    expect(jsonError("INVALID_UPLOAD").status).toBe(400);
    expect(jsonError("INVALID_REQUEST").status).toBe(400);
    expect(jsonError("ADMIN_AUTH_REQUIRED").status).toBe(401);
    expect(jsonError("ADMIN_CSRF_REQUIRED").status).toBe(403);
    expect(jsonError("RATE_LIMITED").status).toBe(429);
    expect(jsonError("SERVER_CONFIGURATION_ERROR").status).toBe(500);
  });

  it("maps rate limit errors to RATE_LIMITED with Retry-After", async () => {
    const error = new Error("limiter key must not leak");
    error.name = "RateLimitExceededError";
    Object.assign(error, { retryAfterSeconds: 42 });

    const response = jsonErrorFromUnknown(error);
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    expect(payload).toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Please try again later.",
      },
    });
    expect(JSON.stringify(payload)).not.toContain("limiter key");
  });

  it("returns a safe server configuration error without leaking secret values", async () => {
    const error = new Error("Missing TOKEN_HASH_SECRET with value super-secret-value");
    error.name = "MissingEnvironmentVariableError";

    const response = jsonErrorFromUnknown(error);
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({
      error: {
        code: "SERVER_CONFIGURATION_ERROR",
        message: "Server configuration error.",
      },
    });
    expect(JSON.stringify(payload)).not.toContain("TOKEN_HASH_SECRET");
    expect(JSON.stringify(payload)).not.toContain("super-secret-value");
  });
});
