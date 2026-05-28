import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    case: {
      findUnique: vi.fn(),
    },
    documentFile: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    caseDocumentRequirement: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    timelineEvent: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    adminNotification: {
      create: vi.fn(),
    },
  };

  return {
    findRequirement: vi.fn(),
    findFile: vi.fn(),
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
    timelineEvent: {
      findFirst: mocks.tx.timelineEvent.findFirst,
    },
    documentFile: {
      findUnique: mocks.findFile,
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
  confirmPortalOfficeRequirement,
  deletePortalUploadedFile,
  PortalFileDeleteAccessError,
  PortalFileUploadAccessError,
  PortalRequirementSubmitAccessError,
  requestPortalOfficeRequirementRevision,
  submitPortalDocumentRequirement,
  uploadPortalDocumentFile,
  withdrawPortalDocumentRequirementSubmission,
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
    title: "Passport",
    responsibleParty: "customer",
    portalVisible: true,
    status: "not_submitted",
    files: [
      {
        id: "file-id",
        storageBucket,
        storagePath: "cases/case-token/requirements/requirement-id/file-id.pdf",
      },
    ],
    ...override,
  };
}

function createDocumentFile(override = {}) {
  return {
    id: "file-id",
    caseId: tokenCaseId,
    requirementId,
    status: "uploaded",
    uploadedByType: "client",
    storageBucket,
    storagePath: "cases/case-token/requirements/requirement-id/file-id.pdf",
    requirement: createRequirement(),
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
    mocks.findFile.mockResolvedValue(createDocumentFile());
    mocks.getStorageBucketName.mockReturnValue(storageBucket);
    mocks.uploadToStorage.mockResolvedValue(undefined);
    mocks.deleteStorageObject.mockResolvedValue(undefined);
    mocks.transaction.mockImplementation(async (callback) => callback(mocks.tx));
    mocks.tx.documentFile.create.mockImplementation(async ({ data }) => ({
      ...data,
      createdAt,
    }));
    mocks.tx.documentFile.update.mockImplementation(async ({ data }) => ({
      id: "file-id",
      requirementId,
      ...data,
    }));
    mocks.tx.documentFile.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.case.findUnique.mockResolvedValue({
      customer: {
        name: "Seed Customer",
      },
    });
    mocks.tx.caseDocumentRequirement.findUnique.mockResolvedValue(createRequirement());
    mocks.tx.caseDocumentRequirement.update.mockResolvedValue({});
    mocks.tx.timelineEvent.create.mockImplementation(async ({ data }) => data);
    mocks.tx.timelineEvent.findFirst.mockResolvedValue({
      metadata: {
        requirementId,
        oldStatus: "not_submitted",
        newStatus: "submitted",
      },
    });
    mocks.tx.adminNotification.create.mockImplementation(async ({ data }) => data);
  });

  it("uploads a portal file, writes metadata, keeps requirement unsubmitted, and returns a safe DTO", async () => {
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
    expect(mocks.tx.caseDocumentRequirement.update).not.toHaveBeenCalled();
    expect(timelineArg.eventType).toBe("file_uploaded");
    expect(timelineArg.metadata).toEqual({
      fileId: createdFileArg.id,
      requirementId,
      uploadedByType: "client",
      mimeType: "application/pdf",
      fileSize: 1024,
    });
    expect(JSON.stringify(timelineArg.metadata)).not.toContain("passport.pdf");
    expect(mocks.tx.adminNotification.create).not.toHaveBeenCalled();
    expect(payload).not.toContain("storagePath");
    expect(payload).not.toContain("storageBucket");
    expect(payload).not.toContain(storageBucket);
    expect(payload).not.toContain("originalFileName");
    expect(result.displayName).toBe("passport.pdf");
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

  it("submits uploaded requirement files and notifies admin only on submit", async () => {
    const result = await submitPortalDocumentRequirement({
      token: "plaintext-test-token",
      requirementId,
    });
    const statusUpdateArg = mocks.tx.caseDocumentRequirement.update.mock.calls[0][0];
    const timelineArg = mocks.tx.timelineEvent.create.mock.calls[0][0].data;
    const notificationArg = mocks.tx.adminNotification.create.mock.calls[0][0].data;

    expect(statusUpdateArg).toEqual({
      where: { id: requirementId },
      data: { status: "submitted" },
    });
    expect(timelineArg.eventType).toBe("requirement_status_changed");
    expect(timelineArg.actorType).toBe("client");
    expect(timelineArg.metadata).toEqual({
      requirementId,
      oldStatus: "not_submitted",
      newStatus: "submitted",
    });
    expect(notificationArg).toMatchObject({
      caseId: tokenCaseId,
      type: "portal_file_uploaded",
      title: "Seed Customer 提交了资料：Passport",
      message: "Seed Customer 提交了资料：Passport",
      targetType: "case_document_requirement",
      targetId: requirementId,
    });
    expect(notificationArg.metadata).toEqual({
      requirementId,
      submittedFileCount: 1,
    });
    expect(JSON.stringify(notificationArg.metadata)).not.toContain("plaintext-test-token");
    expect(JSON.stringify(notificationArg.metadata)).not.toContain("tokenHash");
    expect(JSON.stringify(notificationArg.metadata)).not.toContain("storagePath");
    expect(result).toEqual({
      requirementId,
      clientStatus: "submitted",
      submittedFileCount: 1,
    });
  });

  it("rejects submit when no uploaded files exist", async () => {
    mocks.findRequirement.mockResolvedValue(createRequirement({ files: [] }));

    await expect(
      submitPortalDocumentRequirement({
        token: "plaintext-test-token",
        requirementId,
      }),
    ).rejects.toBeInstanceOf(PortalRequirementSubmitAccessError);
    expect(mocks.tx.caseDocumentRequirement.update).not.toHaveBeenCalled();
    expect(mocks.tx.adminNotification.create).not.toHaveBeenCalled();
  });

  it("allows a client to delete their uploaded file before submitting", async () => {
    const result = await deletePortalUploadedFile({
      token: "plaintext-test-token",
      requirementId,
      fileId: "file-id",
    });
    const updateArg = mocks.tx.documentFile.update.mock.calls[0][0];
    const timelineArg = mocks.tx.timelineEvent.create.mock.calls[0][0].data;

    expect(updateArg).toMatchObject({
      where: { id: "file-id" },
      data: {
        status: "removed",
        portalVisible: false,
        portalDownloadable: false,
        removedByType: "client",
      },
    });
    expect(timelineArg.eventType).toBe("file_removed");
    expect(timelineArg.actorType).toBe("client");
    expect(timelineArg.metadata).toEqual({
      fileId: "file-id",
      requirementId,
    });
    expect(mocks.deleteStorageObject).toHaveBeenCalledWith({
      bucket: storageBucket,
      path: "cases/case-token/requirements/requirement-id/file-id.pdf",
    });
    expect(mocks.tx.adminNotification.create).not.toHaveBeenCalled();
    expect(result).toEqual({
      fileId: "file-id",
      requirementId,
      status: "removed",
    });
  });

  it("rejects client file delete after requirement submission", async () => {
    mocks.findFile.mockResolvedValue(
      createDocumentFile({
        requirement: createRequirement({ status: "submitted" }),
      }),
    );

    await expect(
      deletePortalUploadedFile({
        token: "plaintext-test-token",
        requirementId,
        fileId: "file-id",
      }),
    ).rejects.toBeInstanceOf(PortalFileDeleteAccessError);
    expect(mocks.tx.documentFile.update).not.toHaveBeenCalled();
    expect(mocks.deleteStorageObject).not.toHaveBeenCalled();
  });

  it("does not duplicate notification for already submitted requirements", async () => {
    mocks.findRequirement.mockResolvedValue(createRequirement({ status: "submitted" }));

    const result = await submitPortalDocumentRequirement({
      token: "plaintext-test-token",
      requirementId,
    });

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(result).toEqual({
      requirementId,
      clientStatus: "submitted",
      submittedFileCount: 1,
    });
  });

  it("withdraws a submitted requirement back to initial not_submitted state and removes client files", async () => {
    mocks.findRequirement.mockResolvedValue(createRequirement({ status: "submitted" }));

    const result = await withdrawPortalDocumentRequirementSubmission({
      token: "plaintext-test-token",
      requirementId,
    });
    const statusUpdateArg = mocks.tx.caseDocumentRequirement.update.mock.calls[0][0];
    const fileUpdateArg = mocks.tx.documentFile.updateMany.mock.calls[0][0];
    const timelineEvents = mocks.tx.timelineEvent.create.mock.calls.map((call) => call[0].data);
    const statusTimelineArg = timelineEvents.find(
      (event) => event.eventType === "requirement_status_changed",
    );
    const fileTimelineArg = timelineEvents.find((event) => event.eventType === "file_removed");

    expect(mocks.tx.timelineEvent.findFirst).not.toHaveBeenCalled();
    expect(statusUpdateArg).toEqual({
      where: { id: requirementId },
      data: { status: "not_submitted" },
    });
    expect(fileUpdateArg).toEqual({
      where: {
        id: {
          in: ["file-id"],
        },
        status: "uploaded",
        uploadedByType: "client",
      },
      data: expect.objectContaining({
        status: "removed",
        portalVisible: false,
        portalDownloadable: false,
        removedByType: "client",
        removeReason: "withdrawn_by_client",
      }),
    });
    expect(fileTimelineArg).toEqual(
      expect.objectContaining({
        eventType: "file_removed",
        metadata: {
          fileId: "file-id",
          requirementId,
          reason: "withdrawn_by_client",
        },
      }),
    );
    expect(statusTimelineArg?.summary).toBe("客户已撤回资料");
    expect(statusTimelineArg?.metadata).toEqual({
      requirementId,
      oldStatus: "submitted",
      newStatus: "not_submitted",
    });
    expect(mocks.deleteStorageObject).toHaveBeenCalledWith({
      bucket: storageBucket,
      path: "cases/case-token/requirements/requirement-id/file-id.pdf",
    });
    expect(mocks.tx.adminNotification.create).not.toHaveBeenCalled();
    expect(result).toEqual({
      requirementId,
      clientStatus: "not_submitted",
      submittedFileCount: 0,
    });
  });

  it("withdraws a resubmitted needs_more requirement back to not_submitted", async () => {
    mocks.findRequirement.mockResolvedValue(createRequirement({ status: "submitted" }));
    mocks.tx.timelineEvent.findFirst.mockResolvedValue({
      metadata: {
        requirementId,
        oldStatus: "needs_more",
        newStatus: "submitted",
      },
    });

    const result = await withdrawPortalDocumentRequirementSubmission({
      token: "plaintext-test-token",
      requirementId,
    });

    expect(mocks.tx.caseDocumentRequirement.update.mock.calls[0][0]).toEqual({
      where: { id: requirementId },
      data: { status: "not_submitted" },
    });
    expect(result.clientStatus).toBe("not_submitted");
  });

  it("rejects withdraw for requirements that are not submitted", async () => {
    mocks.findRequirement.mockResolvedValue(createRequirement({ status: "needs_more" }));

    await expect(
      withdrawPortalDocumentRequirementSubmission({
        token: "plaintext-test-token",
        requirementId,
      }),
    ).rejects.toBeInstanceOf(PortalRequirementSubmitAccessError);
    expect(mocks.tx.caseDocumentRequirement.update).not.toHaveBeenCalled();
  });

  it("allows a client to confirm a completed office requirement", async () => {
    mocks.findRequirement.mockResolvedValue(
      createRequirement({
        responsibleParty: "office",
        status: "approved",
        title: "Application form",
      }),
    );
    mocks.tx.caseDocumentRequirement.findUnique.mockResolvedValue(
      createRequirement({
        responsibleParty: "office",
        status: "approved",
        title: "Application form",
      }),
    );

    const result = await confirmPortalOfficeRequirement({
      token: "plaintext-test-token",
      requirementId,
    });
    const timelineArg = mocks.tx.timelineEvent.create.mock.calls[0][0].data;
    const notificationArg = mocks.tx.adminNotification.create.mock.calls[0][0].data;

    expect(mocks.tx.caseDocumentRequirement.update).toHaveBeenCalledWith({
      where: { id: requirementId },
      data: {
        status: "not_applicable",
        portalVisible: true,
        portalDownloadable: true,
      },
    });
    expect(timelineArg).toMatchObject({
      eventType: "requirement_status_changed",
      actorType: "client",
      summary: "客户已确认事务所资料",
      targetType: "case_document_requirement",
      targetId: requirementId,
    });
    expect(timelineArg.metadata).toEqual({
      requirementId,
      oldStatus: "approved",
      newStatus: "not_applicable",
    });
    expect(notificationArg).toMatchObject({
      caseId: tokenCaseId,
      type: "application_confirmation_confirmed",
      title: "Seed Customer 确认了事务所资料：Application form",
      message: "Seed Customer 确认了事务所资料：Application form",
      targetType: "case_document_requirement",
      targetId: requirementId,
    });
    expect(JSON.stringify(notificationArg.metadata)).not.toContain("plaintext-test-token");
    expect(result).toEqual({
      requirementId,
      clientStatus: "not_applicable",
      submittedFileCount: 1,
    });
  });

  it("allows a client to request revision for a completed office requirement", async () => {
    mocks.findRequirement.mockResolvedValue(
      createRequirement({
        responsibleParty: "office",
        status: "approved",
        title: "Application form",
      }),
    );
    mocks.tx.caseDocumentRequirement.findUnique.mockResolvedValue(
      createRequirement({
        responsibleParty: "office",
        status: "approved",
        title: "Application form",
      }),
    );

    const result = await requestPortalOfficeRequirementRevision({
      token: "plaintext-test-token",
      requirementId,
      comment: "Please fix applicant name.",
    });
    const requirementUpdateArg = mocks.tx.caseDocumentRequirement.update.mock.calls[0][0];
    const fileUpdateArg = mocks.tx.documentFile.updateMany.mock.calls[0][0];
    const timelineArg = mocks.tx.timelineEvent.create.mock.calls[0][0].data;
    const notificationArg = mocks.tx.adminNotification.create.mock.calls[0][0].data;

    expect(requirementUpdateArg).toEqual({
      where: { id: requirementId },
      data: {
        status: "submitted",
        portalVisible: true,
        portalDownloadable: false,
        internalNote: "客户要求的说明：Please fix applicant name.",
      },
    });
    expect(fileUpdateArg).toEqual({
      where: {
        requirementId,
        status: "uploaded",
      },
      data: {
        portalVisible: false,
        portalDownloadable: false,
      },
    });
    expect(timelineArg.metadata).toEqual({
      requirementId,
      oldStatus: "approved",
      newStatus: "submitted",
    });
    expect(JSON.stringify(timelineArg.metadata)).not.toContain("Please fix applicant name");
    expect(notificationArg).toMatchObject({
      type: "application_confirmation_revision_requested",
      title: "Seed Customer 要求修改事务所资料：Application form",
      message: "Seed Customer 要求修改事务所资料：Application form",
    });
    expect(JSON.stringify(notificationArg.metadata)).not.toContain("Please fix applicant name");
    expect(JSON.stringify(notificationArg.metadata)).not.toContain("plaintext-test-token");
    expect(result).toEqual({
      requirementId,
      clientStatus: "submitted",
      submittedFileCount: 1,
    });
  });

  it("rejects an office revision request without comment", async () => {
    mocks.findRequirement.mockResolvedValue(
      createRequirement({
        responsibleParty: "office",
        status: "approved",
      }),
    );

    await expect(
      requestPortalOfficeRequirementRevision({
        token: "plaintext-test-token",
        requirementId,
        comment: "   ",
      }),
    ).rejects.toBeInstanceOf(PortalRequirementSubmitAccessError);
    expect(mocks.tx.caseDocumentRequirement.update).not.toHaveBeenCalled();
  });
});

