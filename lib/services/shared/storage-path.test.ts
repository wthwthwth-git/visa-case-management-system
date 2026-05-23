import { describe, expect, it } from "vitest";
import { buildDocumentFileStoragePath } from "./storage-path";

describe("storage path", () => {
  it("builds a deterministic path without the original file name", () => {
    const path = buildDocumentFileStoragePath({
      caseId: "case-id",
      requirementId: "requirement-id",
      documentFileId: "document-file-id",
      extension: "PDF",
    });

    expect(path).toBe("cases/case-id/requirements/requirement-id/document-file-id.pdf");
    expect(path).not.toContain("passport");
  });

  it("falls back to bin for unsafe extensions", () => {
    const path = buildDocumentFileStoragePath({
      caseId: "case-id",
      requirementId: "requirement-id",
      documentFileId: "document-file-id",
      extension: "../pdf",
    });

    expect(path).toBe("cases/case-id/requirements/requirement-id/document-file-id.bin");
  });
});
