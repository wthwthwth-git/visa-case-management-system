import { describe, expect, it } from "vitest";
import { assertSafeTimelineMetadata } from "./sensitive-metadata";

describe("assertSafeTimelineMetadata", () => {
  it("allows ordinary status-change metadata", () => {
    expect(() =>
      assertSafeTimelineMetadata({
        from: "submitted",
        to: "approved",
        reason: "reviewed",
        requirementId: "requirement-id",
        fileId: "file-id",
        tokenId: "token-record-id",
        previousTokenId: "previous-token-record-id",
        newTokenId: "new-token-record-id",
      }),
    ).not.toThrow();
  });

  it.each([
    ["plaintextToken", { plaintextToken: "seed-token" }],
    ["token", { token: "seed-token" }],
    ["tokenHash", { tokenHash: "hash" }],
    ["signedUrl", { signedUrl: "https://example.test/signed" }],
    ["storagePath", { storagePath: "cases/case-id/file.pdf" }],
    ["storageBucket", { storageBucket: "case-files" }],
    ["passportNumber", { passportNumber: "AB1234567" }],
    ["residenceCardNumber", { residenceCardNumber: "RC1234567" }],
    ["nested signedUrl", { nested: { signedUrl: "https://example.test/signed" } }],
    ["Supabase storage URL", { value: "https://project.supabase.co/storage/v1/object/sign/file" }],
    ["X-Amz-Signature", { value: "X-Amz-Signature=abc" }],
    ["token=", { value: "token=abc" }],
  ])("rejects unsafe metadata: %s", (_label, metadata) => {
    expect(() => assertSafeTimelineMetadata(metadata)).toThrow();
  });
});
