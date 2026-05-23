import { beforeEach, describe, expect, it } from "vitest";
import {
  getAllowedUploadFileTypeDescription,
  UploadPolicyError,
  validateUploadFile,
} from "./upload-policy";

const validFile = {
  originalFileName: "passport.pdf",
  mimeType: "application/pdf",
  fileSize: 1024,
  body: new Uint8Array([1, 2, 3]),
};

describe("upload policy", () => {
  beforeEach(() => {
    delete process.env.ALLOWED_UPLOAD_MIME_TYPES;
    delete process.env.MAX_UPLOAD_FILE_SIZE_MB;
  });

  it("accepts allowed files and normalizes metadata", () => {
    const result = validateUploadFile({
      ...validFile,
      originalFileName: " passport.pdf ",
      mimeType: "APPLICATION/PDF",
    });

    expect(result.originalFileName).toBe("passport.pdf");
    expect(result.mimeType).toBe("application/pdf");
    expect(result.safeExtension).toBe("pdf");
  });

  it("rejects unsafe file names", () => {
    expect(() =>
      validateUploadFile({
        ...validFile,
        originalFileName: "../passport.pdf",
      }),
    ).toThrow(UploadPolicyError);
  });

  it.each([
    ["document.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
    ["sheet.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"],
    ["notes.txt", "text/plain", "txt"],
    ["table.csv", "text/csv", "csv"],
  ])("accepts common document file type %s", (originalFileName, mimeType, safeExtension) => {
    const result = validateUploadFile({
      ...validFile,
      originalFileName,
      mimeType,
    });

    expect(result.mimeType).toBe(mimeType);
    expect(result.safeExtension).toBe(safeExtension);
  });

  it("rejects disallowed mime types with allowed format guidance", () => {
    expect(() =>
      validateUploadFile({
        ...validFile,
        mimeType: "application/x-msdownload",
      }),
    ).toThrow("允许上传");
    expect(getAllowedUploadFileTypeDescription()).toContain("Excel (.xlsx)");
    expect(getAllowedUploadFileTypeDescription()).toContain("Word (.docx)");
    expect(getAllowedUploadFileTypeDescription()).toContain("TXT");
  });

  it("rejects oversized files", () => {
    process.env.MAX_UPLOAD_FILE_SIZE_MB = "1";

    expect(() =>
      validateUploadFile({
        ...validFile,
        fileSize: 2 * 1024 * 1024,
      }),
    ).toThrow("单个文件最大 1MB");
  });

  it("uses configured allowed mime types", () => {
    process.env.ALLOWED_UPLOAD_MIME_TYPES = "application/pdf";

    expect(() =>
      validateUploadFile({
        ...validFile,
        mimeType: "image/png",
      }),
    ).toThrow(UploadPolicyError);
  });
});
