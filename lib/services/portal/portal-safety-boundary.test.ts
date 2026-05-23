import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

import { portalServices } from "../index";
import type { PortalFileDTO } from "../types";
import type { PortalApplicationConfirmationDetailDTO } from "./portal-application-confirmation-service";

const bannedKeys = [
  "internalNote",
  "storagePath",
  "storageBucket",
  "tokenHash",
  "plaintextToken",
  "passportNumber",
  "residenceCardNumber",
  "originalFileName",
  "metadata",
  "actorId",
  "actorType",
  "signedUrl",
];

const bannedValues = [
  "do-not-leak-internal-note",
  "cases/case-safe/requirements/requirement-safe/file.pdf",
  "case-files",
  "hashed-token-value",
  "plaintext-token-value",
  "passport-number-value",
  "residence-card-number-value",
  "passport.pdf",
  "metadata-value",
  "internal-operator-value",
  "https://signed.example.test/file",
];

function expectNoBannedPortalFields(payload: string) {
  for (const key of bannedKeys) {
    expect(payload).not.toContain(key);
  }

  for (const value of bannedValues) {
    expect(payload).not.toContain(value);
  }
}

describe("portal service safety boundary", () => {
  it("keeps ordinary Portal case DTOs free of banned fields and values", () => {
    const unsafeSource = {
      id: "case-safe",
      caseNumber: "CASE-001",
      targetVisaType: "Engineer",
      casePhase: "collecting_documents",
      internalNote: "do-not-leak-internal-note",
      tokenHash: "hashed-token-value",
      plaintextToken: "plaintext-token-value",
      metadata: "metadata-value",
      actorId: "internal-operator-value",
      actorType: "internal",
      signedUrl: "https://signed.example.test/file",
      customer: {
        name: "Seed Customer",
        passportNumber: "passport-number-value",
        residenceCardNumber: "residence-card-number-value",
      },
      documentRequirements: [
        {
          id: "requirement-safe",
          title: "Passport",
          customerInstruction: "Upload a copy.",
          internalNote: "do-not-leak-internal-note",
          isRequired: true,
          status: "approved",
          sourceType: "template",
          portalDownloadable: true,
          metadata: "metadata-value",
          files: [
            {
              id: "file-safe",
              originalFileName: "passport.pdf",
              mimeType: "application/pdf",
              fileSize: "1234",
              createdAt: new Date("2026-01-01T00:00:00.000Z"),
              portalDownloadable: true,
              storagePath: "cases/case-safe/requirements/requirement-safe/file.pdf",
              storageBucket: "case-files",
              tokenHash: "hashed-token-value",
              actorId: "internal-operator-value",
              actorType: "internal",
            },
          ],
        },
      ],
      applicationConfirmations: [
        {
          id: "confirmation-safe",
          title: "Application",
          version: 1,
          status: "pending",
          storagePath: "cases/case-safe/application.pdf",
          storageBucket: "case-files",
          metadata: "metadata-value",
        },
      ],
    };
    const dto = portalServices.toPortalCaseDTO(
      unsafeSource as Parameters<typeof portalServices.toPortalCaseDTO>[0],
    );

    expectNoBannedPortalFields(JSON.stringify(dto));
  });

  it("keeps Portal upload and confirmation DTO shapes free of banned fields", () => {
    const uploadResult: PortalFileDTO = {
      id: "file-safe",
      mimeType: "application/pdf",
      fileSize: "1234",
      createdAt: "2026-01-01T00:00:00.000Z",
      portalDownloadable: true,
    };
    const confirmationResult: PortalApplicationConfirmationDetailDTO = {
      id: "confirmation-safe",
      title: "Application",
      version: 1,
      status: "pending",
      confirmedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    expectNoBannedPortalFields(JSON.stringify({ uploadResult, confirmationResult }));
  });

  it("allows signedUrl only for dedicated signed URL result shapes", () => {
    const signedUrlResult = {
      signedUrl: "https://signed.example.test/file",
      expiresAt: new Date("2026-01-01T00:05:00.000Z"),
    };
    const keys = Object.keys(signedUrlResult);
    const payload = JSON.stringify(signedUrlResult);

    expect(keys).toEqual(["signedUrl", "expiresAt"]);
    expect(payload).not.toContain("storagePath");
    expect(payload).not.toContain("storageBucket");
    expect(payload).not.toContain("case-files");
  });

  it("does not expose admin-only service names from the portalServices namespace", () => {
    const portalExportNames = Object.keys(portalServices);
    const adminOnlyNames = [
      "addImmigrationAdditionalRequirement",
      "changeCasePhase",
      "createApplicationConfirmationVersion",
      "createPortalTokenForCase",
      "regeneratePortalTokenForCase",
      "revokeActivePortalTokenForCase",
      "reviewCaseDocumentRequirement",
      "uploadAdminDocumentFile",
    ];

    for (const adminOnlyName of adminOnlyNames) {
      expect(portalExportNames).not.toContain(adminOnlyName);
    }
  });
});
