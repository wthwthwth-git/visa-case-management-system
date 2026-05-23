import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  uploadAdminDocumentFile: vi.fn(),
  removeAdminRequirementUploadedFiles: vi.fn(),
  requireAdminAuth: vi.fn(),
  requireAdminCsrf: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  adminServices: {
    uploadAdminDocumentFile: mocks.uploadAdminDocumentFile,
    removeAdminRequirementUploadedFiles: mocks.removeAdminRequirementUploadedFiles,
  },
}));

vi.mock("@/lib/api/admin-auth", () => ({
  requireAdminAuth: mocks.requireAdminAuth,
}));

vi.mock("@/lib/api/csrf", () => ({
  requireAdminCsrf: mocks.requireAdminCsrf,
}));

import { DELETE, POST } from "./route";

function createUploadFormData() {
  const formData = new FormData();
  formData.set("caseId", "case-id");
  formData.set("requirementId", "body-requirement-id");
  formData.set("file", new File(["hello"], "office-document.pdf", { type: "application/pdf" }));
  formData.set("storagePath", "cases/case-id/file.pdf");
  formData.set("storageBucket", "case-files");
  formData.set("signedUrl", "https://example.com/signed");
  formData.set("tokenHash", "do-not-pass");
  formData.set("plaintextToken", "do-not-pass");
  formData.set("metadata", JSON.stringify({ doNotPass: true }));
  formData.set("status", "approved");
  formData.set("portalVisible", "true");
  formData.set("portalDownloadable", "true");
  formData.set("uploadedBy", "attacker");
  formData.set("uploadedByType", "customer");
  formData.set("originalFileName", "fake-name.pdf");
  formData.set("mimeType", "image/png");
  formData.set("fileSize", "999999");
  formData.set("timeline", "do-not-pass");
  formData.set("eventType", "file_uploaded");
  formData.set("actorId", "operator-id");
  formData.set("actorType", "internal");
  formData.set("newStatus", "approved");

  return formData;
}

function createRequest(formData: FormData) {
  return new Request("http://localhost/api/admin/requirements/route-requirement-id/files", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/admin/requirements/[requirementId]/files", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminAuth.mockResolvedValue({ adminId: "development-admin" });
    mocks.requireAdminCsrf.mockResolvedValue(undefined);
    mocks.uploadAdminDocumentFile.mockResolvedValue({
      id: "file-id",
      requirementId: "route-requirement-id",
      originalFileName: "office-document.pdf",
      mimeType: "application/pdf",
      fileSize: "5",
      status: "uploaded",
      uploadedByType: "internal",
      portalVisible: true,
      portalDownloadable: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    mocks.removeAdminRequirementUploadedFiles.mockResolvedValue({
      requirementId: "route-requirement-id",
      removedFileIds: ["file-1", "file-2"],
      removedCount: 2,
    });
  });

  it("requires admin auth and calls uploadAdminDocumentFile with caseId, route requirementId, and file only", async () => {
    const request = createRequest(createUploadFormData());

    const response = await POST(request, {
      params: Promise.resolve({ requirementId: "route-requirement-id" }),
    });
    const payload = await response.json();
    const serviceArg = mocks.uploadAdminDocumentFile.mock.calls[0][0];

    expect(mocks.requireAdminAuth).toHaveBeenCalledWith(request);
    expect(serviceArg.caseId).toBe("case-id");
    expect(serviceArg.requirementId).toBe("route-requirement-id");
    expect(serviceArg.file).toMatchObject({
      originalFileName: "office-document.pdf",
      mimeType: "application/pdf",
      fileSize: 5,
    });
    expect(serviceArg.file.body).toBeInstanceOf(ArrayBuffer);
    expect(JSON.stringify(serviceArg)).not.toContain("body-requirement-id");
    expect(JSON.stringify(serviceArg)).not.toContain("storagePath");
    expect(JSON.stringify(serviceArg)).not.toContain("storageBucket");
    expect(JSON.stringify(serviceArg)).not.toContain("signedUrl");
    expect(JSON.stringify(serviceArg)).not.toContain("tokenHash");
    expect(JSON.stringify(serviceArg)).not.toContain("approved");
    expect(JSON.stringify(serviceArg)).not.toContain("fake-name.pdf");
    expect(payload.data[0].id).toBe("file-id");
  });

  it("supports uploading multiple files in one request", async () => {
    const formData = createUploadFormData();
    formData.append(
      "file",
      new File(["world"], "supporting-document.txt", { type: "text/plain" }),
    );

    const response = await POST(createRequest(formData), {
      params: Promise.resolve({ requirementId: "route-requirement-id" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.uploadAdminDocumentFile).toHaveBeenCalledTimes(2);
    expect(mocks.uploadAdminDocumentFile.mock.calls[0][0].file.originalFileName).toBe(
      "office-document.pdf",
    );
    expect(mocks.uploadAdminDocumentFile.mock.calls[1][0].file.originalFileName).toBe(
      "supporting-document.txt",
    );
    expect(Array.isArray(payload.data)).toBe(true);
  });

  it("does not include storage fields, signedUrl, or tokenHash in the response", async () => {
    const response = await POST(createRequest(createUploadFormData()), {
      params: Promise.resolve({ requirementId: "route-requirement-id" }),
    });
    const payload = JSON.stringify(await response.json());

    expect(payload).not.toContain("storagePath");
    expect(payload).not.toContain("storageBucket");
    expect(payload).not.toContain("signedUrl");
    expect(payload).not.toContain("tokenHash");
  });

  it("returns INVALID_REQUEST when caseId is missing", async () => {
    const formData = createUploadFormData();
    formData.delete("caseId");

    const response = await POST(createRequest(formData), {
      params: Promise.resolve({ requirementId: "route-requirement-id" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "Invalid request.",
      },
    });
    expect(mocks.uploadAdminDocumentFile).not.toHaveBeenCalled();
  });

  it("returns INVALID_UPLOAD when file is missing", async () => {
    const formData = createUploadFormData();
    formData.delete("file");

    const response = await POST(createRequest(formData), {
      params: Promise.resolve({ requirementId: "route-requirement-id" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_UPLOAD");
    expect(payload.error.message).toContain("允许上传的格式");
    expect(mocks.uploadAdminDocumentFile).not.toHaveBeenCalled();
  });

  it("maps upload policy errors to INVALID_UPLOAD", async () => {
    const error = new Error("storagePath and file details must not leak");
    error.name = "UploadPolicyError";
    mocks.uploadAdminDocumentFile.mockRejectedValue(error);

    const response = await POST(createRequest(createUploadFormData()), {
      params: Promise.resolve({ requirementId: "route-requirement-id" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_UPLOAD");
    expect(JSON.stringify(payload)).not.toContain("storagePath");
  });

  it.each(["AdminFileUploadAccessError", "AdminFileUploadInputError"])(
    "maps %s to INVALID_REQUEST",
    async (errorName) => {
      const error = new Error("storageBucket and tokenHash must not leak");
      error.name = errorName;
      mocks.uploadAdminDocumentFile.mockRejectedValue(error);

      const response = await POST(createRequest(createUploadFormData()), {
        params: Promise.resolve({ requirementId: "route-requirement-id" }),
      });
      const payload = await response.json();

      expect(response.status).toBe(400);
      expect(payload.error.code).toBe("INVALID_REQUEST");
      expect(JSON.stringify(payload)).not.toContain("storageBucket");
      expect(JSON.stringify(payload)).not.toContain("tokenHash");
    },
  );

  it("maps auth failure to ADMIN_AUTH_REQUIRED and does not call service", async () => {
    const error = new Error("auth required");
    error.name = "AdminAuthNotImplementedError";
    mocks.requireAdminAuth.mockRejectedValue(error);

    const response = await POST(createRequest(createUploadFormData()), {
      params: Promise.resolve({ requirementId: "route-requirement-id" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("ADMIN_AUTH_REQUIRED");
    expect(mocks.uploadAdminDocumentFile).not.toHaveBeenCalled();
  });

  it("does not import prisma, portal services, direct storage upload, DocumentFile writes, or timeline writers", () => {
    const source = readFileSync(resolve(__dirname, "route.ts"), "utf8");

    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("@prisma/client");
    expect(source).not.toContain("portalServices");
    expect(source).not.toContain("uploadToStorage");
    expect(source).not.toContain("storage-upload");
    expect(source).not.toContain("documentFile");
    expect(source).not.toContain("createTimelineEvent");
  });

  it("deletes all uploaded files for the route requirement id and ignores dangerous body fields", async () => {
    const request = new Request("http://localhost/api/admin/requirements/route-requirement-id/files", {
      method: "DELETE",
      body: JSON.stringify({
        requirementId: "body-requirement-id",
        fileId: "body-file-id",
        reason: "mistaken upload",
        storagePath: "cases/case-id/file.pdf",
        storageBucket: "case-files",
        signedUrl: "https://example.com/signed",
        tokenHash: "do-not-pass",
        status: "uploaded",
      }),
    });

    const response = await DELETE(request, {
      params: Promise.resolve({ requirementId: "route-requirement-id" }),
    });
    const payload = await response.json();
    const serviceArg = mocks.removeAdminRequirementUploadedFiles.mock.calls[0][0];

    expect(response.status).toBe(200);
    expect(mocks.requireAdminAuth).toHaveBeenCalledWith(request);
    expect(mocks.requireAdminCsrf).toHaveBeenCalledWith(request);
    expect(serviceArg).toEqual({
      requirementId: "route-requirement-id",
      reason: "mistaken upload",
    });
    expect(JSON.stringify(serviceArg)).not.toContain("body-requirement-id");
    expect(JSON.stringify(serviceArg)).not.toContain("storagePath");
    expect(JSON.stringify(serviceArg)).not.toContain("tokenHash");
    expect(payload.data.removedCount).toBe(2);
  });

  it("maps bulk file delete errors safely", async () => {
    const error = new Error("storagePath must not leak");
    error.name = "AdminFileDeleteAccessError";
    mocks.removeAdminRequirementUploadedFiles.mockRejectedValue(error);

    const response = await DELETE(
      new Request("http://localhost/api/admin/requirements/route-requirement-id/files", {
        method: "DELETE",
      }),
      {
        params: Promise.resolve({ requirementId: "route-requirement-id" }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
    expect(JSON.stringify(payload)).not.toContain("storagePath");
  });
});
