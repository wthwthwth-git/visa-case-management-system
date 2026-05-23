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

vi.mock("../shared/storage-upload", () => ({
  getStorageBucketName: mocks.getStorageBucketName,
  uploadToStorage: mocks.uploadToStorage,
  deleteStorageObject: mocks.deleteStorageObject,
}));

import { AdminFileUploadAccessError, uploadAdminDocumentFile } from "./file-upload-service";

const caseId = "case-admin";
const requirementId = "requirement-id";
const storageBucket = "case-files";
const createdAt = new Date("2026-01-01T00:00:00.000Z");
const uploadFile = {
  originalFileName: "office-document.pdf",
  mimeType: "application/pdf",
  fileSize: 2048,
  body: new Uint8Array([1, 2, 3]),
};

function createRequirement(override = {}) {
  return {
    id: requirementId,
    caseId,
    responsibleParty: "customer",
    sourceType: "template",
    status: "not_submitted",
    ...override,
  };
}

describe("admin file upload service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it.each([
    ["customer requirement", createRequirement({ responsibleParty: "customer" })],
    ["office requirement", createRequirement({ responsibleParty: "office" })],
    ["custom requirement", createRequirement({ sourceType: "custom" })],
    ["immigration request requirement", createRequirement({ sourceType: "immigration_request" })],
  ])("uploads to %s", async (_label, requirement) => {
    mocks.findRequirement.mockResolvedValue(requirement);

    const result = await uploadAdminDocumentFile({
      caseId,
      requirementId,
      file: uploadFile,
    });
    const payload = JSON.stringify(result);
    const createdFileArg = mocks.tx.documentFile.create.mock.calls[0][0].data;
    const timelineArg = mocks.tx.timelineEvent.create.mock.calls[0][0].data;

    expect(createdFileArg.caseId).toBe(caseId);
    expect(createdFileArg.requirementId).toBe(requirementId);
    expect(createdFileArg.uploadedByType).toBe("internal");
    expect(timelineArg.metadata).toEqual({
      fileId: createdFileArg.id,
      requirementId,
      uploadedByType: "internal",
      mimeType: "application/pdf",
      fileSize: 2048,
    });
    expect(JSON.stringify(timelineArg.metadata)).not.toContain("office-document.pdf");
    expect(payload).not.toContain("storagePath");
    expect(payload).not.toContain("storageBucket");
    expect(payload).not.toContain(storageBucket);
    expect(result.originalFileName).toBe("office-document.pdf");
  });

  it("rejects a requirement that does not belong to the case", async () => {
    mocks.findRequirement.mockResolvedValue(createRequirement({ caseId: "other-case" }));

    await expect(
      uploadAdminDocumentFile({
        caseId,
        requirementId,
        file: uploadFile,
      }),
    ).rejects.toBeInstanceOf(AdminFileUploadAccessError);
    expect(mocks.uploadToStorage).not.toHaveBeenCalled();
  });

  it("updates not_submitted requirements to submitted", async () => {
    await uploadAdminDocumentFile({
      caseId,
      requirementId,
      file: uploadFile,
    });

    expect(mocks.tx.caseDocumentRequirement.update).toHaveBeenCalledWith({
      where: { id: requirementId },
      data: { status: "submitted" },
    });
  });

  it("does not auto-approve already submitted requirements", async () => {
    mocks.findRequirement.mockResolvedValue(createRequirement({ status: "submitted" }));

    await uploadAdminDocumentFile({
      caseId,
      requirementId,
      file: uploadFile,
    });

    expect(mocks.tx.caseDocumentRequirement.update).not.toHaveBeenCalled();
  });

  it("does not write DB records or timeline when storage upload fails", async () => {
    mocks.uploadToStorage.mockRejectedValue(new Error("storage failed"));

    await expect(
      uploadAdminDocumentFile({
        caseId,
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
      uploadAdminDocumentFile({
        caseId,
        requirementId,
        file: uploadFile,
      }),
    ).rejects.toThrow("db failed");
    expect(mocks.deleteStorageObject).toHaveBeenCalledWith({
      bucket: storageBucket,
      path: expect.stringContaining(`cases/${caseId}/requirements/${requirementId}/`),
    });
  });
});
