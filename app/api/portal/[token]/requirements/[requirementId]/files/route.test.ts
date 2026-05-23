import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  uploadPortalDocumentFile: vi.fn(),
  validatePortalToken: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  portalServices: {
    uploadPortalDocumentFile: mocks.uploadPortalDocumentFile,
    validatePortalToken: mocks.validatePortalToken,
  },
}));

import { POST } from "./route";

const forbiddenFields = [
  "internalNote",
  "storagePath",
  "storageBucket",
  "tokenHash",
  "originalFileName",
  "metadata",
  "actorId",
  "actorType",
  "signedUrl",
];

function createUploadRequest() {
  const formData = new FormData();
  formData.set("file", new File(["hello"], "passport.pdf", { type: "application/pdf" }));
  formData.set("caseId", "attacker-case");
  formData.set("storagePath", "cases/attacker/file.pdf");
  formData.set("portalVisible", "false");

  return new Request("http://localhost/api/portal/token/requirements/requirement-id/files", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/portal/[token]/requirements/[requirementId]/files", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validatePortalToken.mockResolvedValue({
      tokenId: "token-id",
      caseId: "case-id",
    });
    mocks.uploadPortalDocumentFile.mockResolvedValue({
      id: "file-id",
      mimeType: "application/pdf",
      fileSize: "5",
      createdAt: "2026-01-01T00:00:00.000Z",
      portalDownloadable: true,
    });
  });

  it("ignores FormData.caseId and calls portalServices with token, requirementId, and file only", async () => {
    const response = await POST(createUploadRequest(), {
      params: Promise.resolve({
        token: "portal-token",
        requirementId: "requirement-id",
      }),
    });
    const payload = await response.json();
    const serviceArg = mocks.uploadPortalDocumentFile.mock.calls[0][0];

    expect(serviceArg.token).toBe("portal-token");
    expect(serviceArg.requirementId).toBe("requirement-id");
    expect(serviceArg).not.toHaveProperty("caseId");
    expect(serviceArg).not.toHaveProperty("storagePath");
    expect(serviceArg.file).toMatchObject({
      originalFileName: "passport.pdf",
      mimeType: "application/pdf",
      fileSize: 5,
    });
    expect(serviceArg.file.body).toBeInstanceOf(ArrayBuffer);
    expect(payload.data.id).toBe("file-id");
  });

  it("does not include forbidden fields or signedUrl in the upload response", async () => {
    const response = await POST(createUploadRequest(), {
      params: Promise.resolve({
        token: "portal-token",
        requirementId: "requirement-id",
      }),
    });
    const payload = JSON.stringify(await response.json());

    for (const field of forbiddenFields) {
      expect(payload).not.toContain(field);
    }

    expect(payload).not.toContain("passport.pdf");
  });

  it("returns INVALID_UPLOAD when file is missing", async () => {
    const formData = new FormData();
    formData.set("caseId", "attacker-case");

    const response = await POST(
      new Request("http://localhost/api/portal/token/requirements/requirement-id/files", {
        method: "POST",
        body: formData,
      }),
      {
        params: Promise.resolve({
          token: "portal-token",
          requirementId: "requirement-id",
        }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_UPLOAD");
    expect(payload.error.message).toContain("允许上传的格式");
    expect(mocks.uploadPortalDocumentFile).not.toHaveBeenCalled();
  });

  it("maps upload policy errors to INVALID_UPLOAD", async () => {
    const error = new Error("storagePath and file details must not leak");
    error.name = "UploadPolicyError";
    mocks.uploadPortalDocumentFile.mockRejectedValue(error);

    const response = await POST(createUploadRequest(), {
      params: Promise.resolve({
        token: "portal-token",
        requirementId: "requirement-id",
      }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_UPLOAD");
    expect(payload.error.message).toContain("允许上传的格式");
    expect(JSON.stringify(payload)).not.toContain("storagePath");
  });

  it("does not import prisma or admin services", () => {
    const source = readFileSync(resolve(__dirname, "route.ts"), "utf8");

    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("adminServices");
  });
});
