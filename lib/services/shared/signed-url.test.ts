import { describe, expect, it, vi, beforeEach } from "vitest";
import { assertSafeTimelineMetadata } from "./sensitive-metadata";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  validatePortalToken: vi.fn(),
  createStorageSignedUrl: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    documentFile: {
      findUnique: mocks.findUnique,
    },
  },
}));

vi.mock("../portal/portal-token-service", () => ({
  validatePortalToken: mocks.validatePortalToken,
}));

vi.mock("./supabase-storage", () => ({
  createStorageSignedUrl: mocks.createStorageSignedUrl,
}));

import {
  FileNotAccessibleError,
  createAdminFileSignedUrl,
  createPortalFileSignedUrl,
} from "./signed-url";

const tokenCaseId = "case-token";
const requirementId = "requirement-id";
const fileId = "file-id";
const signedUrl = "https://signed.example.test/file";

type MockDocumentFile = {
  id: string;
  caseId: string;
  requirementId: string;
  storageBucket: string;
  storagePath: string;
  originalFileName: string;
  mimeType: string;
  fileSize: bigint;
  status: "uploaded" | "removed" | "replaced";
  uploadedByType: "internal" | "client" | "system";
  portalVisible: boolean;
  portalDownloadable: boolean;
  requirement: {
    id: string;
    caseId: string;
    portalVisible: boolean;
    portalDownloadable: boolean;
  };
};

function createFileOverride(override: Partial<MockDocumentFile> = {}) {
  return {
    ...createAccessibleFile(),
    ...override,
  };
}

function createAccessibleFile(): MockDocumentFile {
  return {
    id: fileId,
    caseId: tokenCaseId,
    requirementId,
    storageBucket: "case-files",
    storagePath: "cases/case-token/requirements/requirement-id/file-id.pdf",
    originalFileName: "file-id.pdf",
    mimeType: "application/pdf",
    fileSize: BigInt(1234),
    status: "uploaded",
    uploadedByType: "internal",
    portalVisible: true,
    portalDownloadable: true,
    requirement: {
      id: requirementId,
      caseId: tokenCaseId,
      portalVisible: true,
      portalDownloadable: true,
    },
  };
}

describe("signed URL service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.STORAGE_SIGNED_URL_EXPIRES_IN_SECONDS;
    mocks.validatePortalToken.mockResolvedValue({
      tokenId: "token-id",
      caseId: tokenCaseId,
    });
    mocks.createStorageSignedUrl.mockResolvedValue(signedUrl);
  });

  it("returns a portal signed URL for an accessible file without raw storage fields", async () => {
    mocks.findUnique.mockResolvedValue(createAccessibleFile());

    const result = await createPortalFileSignedUrl({
      token: "plaintext-test-token",
      fileId,
    });
    const payload = JSON.stringify(result);

    expect(result.signedUrl).toBe(signedUrl);
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(mocks.validatePortalToken).toHaveBeenCalledWith("plaintext-test-token");
    expect(mocks.createStorageSignedUrl).toHaveBeenCalledWith({
      bucket: "case-files",
      path: "cases/case-token/requirements/requirement-id/file-id.pdf",
      expiresInSeconds: 300,
    });
    expect(payload).not.toContain("storagePath");
    expect(payload).not.toContain("storageBucket");
    expect(payload).not.toContain("case-files");
    expect(payload).not.toContain("cases/case-token");
  });

  it.each([
    ["file belongs to another case", createFileOverride({ caseId: "other-case" })],
    [
      "requirement belongs to another case",
      createFileOverride({
        requirement: {
          ...createAccessibleFile().requirement,
          caseId: "other-case",
        },
      }),
    ],
    [
      "requirement is not visible",
      createFileOverride({
        requirement: {
          ...createAccessibleFile().requirement,
          portalVisible: false,
        },
      }),
    ],
    [
      "requirement is not downloadable",
      createFileOverride({
        requirement: {
          ...createAccessibleFile().requirement,
          portalDownloadable: false,
        },
      }),
    ],
    ["file is not visible", createFileOverride({ portalVisible: false })],
    ["file is not downloadable", createFileOverride({ portalDownloadable: false })],
    ["file is removed", createFileOverride({ status: "removed" })],
    ["file is replaced", createFileOverride({ status: "replaced" })],
  ])("rejects portal download when %s", async (_label, file) => {
    mocks.findUnique.mockResolvedValue(file);

    await expect(
      createPortalFileSignedUrl({
        token: "plaintext-test-token",
        fileId,
      }),
    ).rejects.toBeInstanceOf(FileNotAccessibleError);
    expect(mocks.createStorageSignedUrl).not.toHaveBeenCalled();
  });

  it("allows portal download for files uploaded by the client even when requirement download is disabled", async () => {
    mocks.findUnique.mockResolvedValue(
      createFileOverride({
        uploadedByType: "client",
        requirement: {
          ...createAccessibleFile().requirement,
          portalDownloadable: false,
        },
      }),
    );

    const result = await createPortalFileSignedUrl({
      token: "plaintext-test-token",
      fileId,
    });

    expect(result.signedUrl).toBe(signedUrl);
    expect(mocks.createStorageSignedUrl).toHaveBeenCalled();
  });

  it("uses a unified portal error when token validation fails", async () => {
    mocks.validatePortalToken.mockRejectedValue(new Error("invalid token"));

    await expect(
      createPortalFileSignedUrl({
        token: "plaintext-test-token",
        fileId,
      }),
    ).rejects.toBeInstanceOf(FileNotAccessibleError);
  });

  it("returns an admin signed URL without raw storage fields", async () => {
    mocks.findUnique.mockResolvedValue({
      storageBucket: "case-files",
      storagePath: "cases/case-token/admin-file.pdf",
      status: "uploaded",
    });

    const result = await createAdminFileSignedUrl({ fileId });
    const payload = JSON.stringify(result);

    expect(result.signedUrl).toBe(signedUrl);
    expect(mocks.createStorageSignedUrl).toHaveBeenCalledWith({
      bucket: "case-files",
      path: "cases/case-token/admin-file.pdf",
      expiresInSeconds: 900,
    });
    expect(payload).not.toContain("storagePath");
    expect(payload).not.toContain("storageBucket");
    expect(payload).not.toContain("case-files");
    expect(payload).not.toContain("cases/case-token");
  });

  it("rejects missing admin files", async () => {
    mocks.findUnique.mockResolvedValue(null);

    await expect(createAdminFileSignedUrl({ fileId })).rejects.toBeInstanceOf(
      FileNotAccessibleError,
    );
  });

  it("rejects removed admin files", async () => {
    mocks.findUnique.mockResolvedValue({
      storageBucket: "case-files",
      storagePath: "cases/case-token/admin-file.pdf",
      status: "removed",
    });

    await expect(createAdminFileSignedUrl({ fileId })).rejects.toBeInstanceOf(
      FileNotAccessibleError,
    );
  });

  it("does not write signed URLs to timeline metadata", () => {
    expect(() =>
      assertSafeTimelineMetadata({
        signedUrl,
      }),
    ).toThrow();
  });
});
