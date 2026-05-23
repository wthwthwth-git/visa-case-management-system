import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    documentFile: {
      create: vi.fn(),
    },
    caseDocumentRequirement: {
      update: vi.fn(),
    },
    timelineEvent: {
      create: vi.fn(),
    },
  };

  return {
    findRequirement: vi.fn(),
    transaction: vi.fn(),
    validatePortalToken: vi.fn(),
    getStorageBucketName: vi.fn(),
    uploadToStorage: vi.fn(),
    deleteStorageObject: vi.fn(),
    tx,
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    caseDocumentRequirement: {
      findUnique: mocks.findRequirement,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("./portal-token-service", () => ({
  validatePortalToken: mocks.validatePortalToken,
}));

vi.mock("../shared/storage-upload", () => ({
  getStorageBucketName: mocks.getStorageBucketName,
  uploadToStorage: mocks.uploadToStorage,
  deleteStorageObject: mocks.deleteStorageObject,
}));

import {
  PortalFileUploadAccessError,
  uploadPortalDocumentFile,
} from "./portal-upload-service";

const tokenCaseId = "case-token";
const requirementId = "requirement-id";
const storageBucket = "case-files";
const createdAt = new Date("2026-01-01T00:00:00.000Z");
const uploadFile = {
  originalFileName: "passport.pdf",
  mimeType: "application/pdf",
  fileSize: 1024,
  body: new Uint8Array([1, 2, 3]),
};

function createRequirement(override = {}) {
  return {
    id: requirementId,
    caseId: tokenCaseId,
    responsibleParty: "customer",
    portalVisible: true,
    status: "not_submitted",
    ...override,
  };
}

describe("portal upload service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validatePortalToken.mockResolvedValue({
      tokenId: "token-id",
      caseId: tokenCaseId,
    });
    mocks.findRequirement.mockResolvedValue(createRequirement());
    mocks.getStorageBucketName.mockReturnValue(storageBucket);
    mocks.uploadToStorage.mockResolvedValue(undefined);
    mocks.deleteStorageObject.mockResolvedValue(undefined);
    mocks.transaction.mockImplementation(async (callback) => callback(mocks.tx));
    mocks.tx.documentFile.create.mockImplementation(async ({ data }) => ({
      ...data,
      createdAt,
    }));
    mocks.tx.caseDocumentRequirement.update.mockResolvedValue({});
    mocks.tx.timelineEvent.create.mockImplementation(async ({ data }) => data);
  });

  it("uploads a portal file, writes metadata, updates not_submitted, and returns a safe DTO", async () => {
    const result = await uploadPortalDocumentFile({
      token: "plaintext-test-token",
      requirementId,
      file: uploadFile,
    });
    const payload = JSON.stringify(result);
    const createdFileArg = mocks.tx.documentFile.create.mock.calls[0][0].data;
    const timelineArg = mocks.tx.timelineEvent.create.mock.calls[0][0].data;

    expect(mocks.validatePortalToken).toHaveBeenCalledWith("plaintext-test-token");
    expect(createdFileArg.caseId).toBe(tokenCaseId);
    expect(createdFileArg.requirementId).toBe(requirementId);
    expect(createdFileArg.uploadedByType).toBe("client");
    expect(createdFileArg.portalVisible).toBe(true);
    expect(createdFileArg.portalDownloadable).toBe(true);
    expect(mocks.uploadToStorage.mock.calls[0][0].path).toContain(
      `cases/${tokenCaseId}/requirements/${requirementId}/`,
    );
    expect(mocks.tx.caseDocumentRequirement.update).toHaveBeenCalledWith({
      where: { id: requirementId },
      data: { status: "submitted" },
    });
    expect(timelineArg.eventType).toBe("file_uploaded");
    expect(timelineArg.metadata).toEqual({
      fileId: createdFileArg.id,
      requirementId,
      uploadedByType: "client",
      mimeType: "application/pdf",
      fileSize: 1024,
    });
    expect(JSON.stringify(timelineArg.metadata)).not.toContain("passport.pdf");
    expect(payload).not.toContain("storagePath");
    expect(payload).not.toContain("storageBucket");
    expect(payload).not.toContain(storageBucket);
    expect(payload).not.toContain("originalFileName");
    expect(payload).not.toContain("passport.pdf");
  });

  it("does not trust a client supplied case id because no caseId is accepted", async () => {
    await uploadPortalDocumentFile({
      token: "plaintext-test-token",
      requirementId,
      file: uploadFile,
    });

    expect(mocks.tx.documentFile.create.mock.calls[0][0].data.caseId).toBe(tokenCaseId);
  });

  it.each([
    ["another case", createRequirement({ caseId: "other-case" })],
    ["office requirement", createRequirement({ responsibleParty: "office" })],
    ["hidden requirement", createRequirement({ portalVisible: false })],
  ])("rejects uploads to %s", async (_label, requirement) => {
    mocks.findRequirement.mockResolvedValue(requirement);

    await expect(
      uploadPortalDocumentFile({
        token: "plaintext-test-token",
        requirementId,
        file: uploadFile,
      }),
    ).rejects.toBeInstanceOf(PortalFileUploadAccessError);
    expect(mocks.uploadToStorage).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not write DB records or timeline when storage upload fails", async () => {
    mocks.uploadToStorage.mockRejectedValue(new Error("storage failed"));

    await expect(
      uploadPortalDocumentFile({
        token: "plaintext-test-token",
        requirementId,
        file: uploadFile,
      }),
    ).rejects.toThrow("storage failed");
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.tx.timelineEvent.create).not.toHaveBeenCalled();
  });

  it("attempts storage cleanup when DB writing fails", async () => {
    mocks.tx.documentFile.create.mockRejectedValue(new Error("db failed"));

    await expect(
      uploadPortalDocumentFile({
        token: "plaintext-test-token",
        requirementId,
        file: uploadFile,
      }),
    ).rejects.toThrow("db failed");
    expect(mocks.deleteStorageObject).toHaveBeenCalledWith({
      bucket: storageBucket,
      path: expect.stringContaining(`cases/${tokenCaseId}/requirements/${requirementId}/`),
    });
  });
});
