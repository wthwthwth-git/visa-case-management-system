import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findCase: vi.fn(),
  deleteCase: vi.fn(),
  deleteStorageObject: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    case: {
      findUnique: mocks.findCase,
      delete: mocks.deleteCase,
    },
    customer: {
      delete: vi.fn(),
    },
  },
}));

vi.mock("../shared/storage-upload", () => ({
  deleteStorageObject: mocks.deleteStorageObject,
}));

import { prisma } from "@/lib/prisma";
import { CaseDeleteAccessError, removeAdminCase } from "./case-delete-service";

function createCaseRecord() {
  return {
    id: "case-1",
    caseNumber: "CASE-001",
    _count: {
      documentRequirements: 3,
      documentFiles: 2,
      applicationConfirmations: 1,
      accessTokens: 1,
    },
    documentFiles: [
      {
        storageBucket: "case-files",
        storagePath: "cases/case-1/requirements/req-1/file-1.pdf",
      },
      {
        storageBucket: "case-files",
        storagePath: "cases/case-1/requirements/req-2/file-2.pdf",
      },
    ],
    applicationConfirmations: [
      {
        storageBucket: "case-files",
        storagePath: "cases/case-1/application-confirmations/confirmation.pdf",
      },
    ],
  };
}

describe("admin case delete service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findCase.mockResolvedValue(createCaseRecord());
    mocks.deleteCase.mockResolvedValue({});
    mocks.deleteStorageObject.mockResolvedValue(undefined);
  });

  it("deletes the case and returns a DTO with removed counts", async () => {
    const result = await removeAdminCase({ caseId: "case-1" });

    expect(mocks.findCase).toHaveBeenCalledWith({
      where: { id: "case-1" },
      select: expect.objectContaining({
        id: true,
        caseNumber: true,
      }),
    });
    expect(mocks.deleteCase).toHaveBeenCalledWith({
      where: { id: "case-1" },
    });
    expect(result).toEqual({
      caseId: "case-1",
      caseNumber: "CASE-001",
      removedRequirementCount: 3,
      removedFileCount: 2,
      removedApplicationConfirmationCount: 1,
      removedAccessTokenCount: 1,
    });
  });

  it("attempts best-effort cleanup for document and confirmation storage objects", async () => {
    await removeAdminCase({ caseId: "case-1" });

    expect(mocks.deleteStorageObject).toHaveBeenCalledTimes(3);
    expect(mocks.deleteStorageObject).toHaveBeenCalledWith({
      bucket: "case-files",
      path: "cases/case-1/requirements/req-1/file-1.pdf",
    });
    expect(mocks.deleteStorageObject).toHaveBeenCalledWith({
      bucket: "case-files",
      path: "cases/case-1/application-confirmations/confirmation.pdf",
    });
  });

  it("does not fail when best-effort storage cleanup fails", async () => {
    mocks.deleteStorageObject.mockRejectedValue(new Error("storage unavailable"));

    await expect(removeAdminCase({ caseId: "case-1" })).resolves.toMatchObject({
      caseId: "case-1",
    });
  });

  it("fails safely when the case does not exist", async () => {
    mocks.findCase.mockResolvedValue(null);

    await expect(removeAdminCase({ caseId: "missing-case" })).rejects.toBeInstanceOf(
      CaseDeleteAccessError,
    );
    expect(mocks.deleteCase).not.toHaveBeenCalled();
    expect(mocks.deleteStorageObject).not.toHaveBeenCalled();
  });

  it("does not delete the linked customer", async () => {
    await removeAdminCase({ caseId: "case-1" });

    expect(prisma.customer.delete).not.toHaveBeenCalled();
  });
});
