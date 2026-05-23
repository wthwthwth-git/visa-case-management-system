import { describe, expect, it } from "vitest";
import { toPortalCaseDTO, toPortalRequirementDTO } from "./portal-dto";

const leakedValue = "DO_NOT_LEAK";

describe("portal DTO boundary", () => {
  it("maps requirement DTO through a strict portal whitelist", () => {
    const source = {
      id: "requirement-id",
      title: "Passport",
      customerInstruction: "Upload a copy.",
      internalNote: leakedValue,
      isRequired: true,
      status: "approved" as const,
      sourceType: "template" as const,
      portalDownloadable: true,
      metadata: leakedValue,
      files: [
        {
          id: "file-id",
          originalFileName: "passport.pdf",
          mimeType: "application/pdf",
          fileSize: BigInt(1234),
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          portalDownloadable: true,
          storagePath: leakedValue,
          storageBucket: leakedValue,
          tokenHash: leakedValue,
          actorId: leakedValue,
        },
      ],
    };

    const dto = toPortalRequirementDTO(source);
    const payload = JSON.stringify(dto);

    expect(dto.clientStatus).toBe("accepted");
    expect(dto.files[0]?.portalDownloadable).toBe(true);
    expect(payload).not.toContain(leakedValue);
    expect(payload).not.toContain("internalNote");
    expect(payload).not.toContain("storagePath");
    expect(payload).not.toContain("storageBucket");
    expect(payload).not.toContain("tokenHash");
    expect(payload).not.toContain("actorId");
    expect(payload).not.toContain("metadata");
    expect(payload).not.toContain("originalFileName");
    expect(payload).not.toContain("passport.pdf");
  });

  it("maps case DTO without leaking customer or internal-only fields", () => {
    const source = {
      id: "case-id",
      caseNumber: "SEED-CASE-001",
      currentVisaType: leakedValue,
      targetVisaType: "Seed Target Visa",
      casePhase: "draft" as const,
      tokenHash: leakedValue,
      metadata: leakedValue,
      customer: {
        name: "Seed Test Customer",
        email: "seed.customer@example.com",
        passportNumber: leakedValue,
        residenceCardNumber: leakedValue,
      },
      documentRequirements: [
        {
          id: "requirement-id",
          title: "Passport",
          customerInstruction: "Upload a copy.",
          internalNote: leakedValue,
          isRequired: true,
          status: "approved" as const,
          sourceType: "template" as const,
          portalDownloadable: false,
          files: [
            {
              id: "file-id",
              originalFileName: "passport.pdf",
              mimeType: "application/pdf",
              fileSize: "1234",
              createdAt: new Date("2026-01-01T00:00:00.000Z"),
              portalDownloadable: true,
              storagePath: leakedValue,
              storageBucket: leakedValue,
            },
          ],
        },
      ],
      applicationConfirmations: [
        {
          id: "confirmation-id",
          title: "Application Confirmation",
          version: 1,
          status: "pending" as const,
          storagePath: leakedValue,
          storageBucket: leakedValue,
        },
      ],
    };

    const dto = toPortalCaseDTO(source);
    const payload = JSON.stringify(dto);

    expect(dto.requirements[0]?.clientStatus).toBe("accepted");
    expect(dto.requirements[0]?.files[0]?.portalDownloadable).toBe(false);
    expect(payload).not.toContain(leakedValue);
    expect(payload).not.toContain("internalNote");
    expect(payload).not.toContain("storagePath");
    expect(payload).not.toContain("storageBucket");
    expect(payload).not.toContain("tokenHash");
    expect(payload).not.toContain("passportNumber");
    expect(payload).not.toContain("residenceCardNumber");
    expect(payload).not.toContain("actorId");
    expect(payload).not.toContain("metadata");
    expect(payload).not.toContain("originalFileName");
    expect(payload).not.toContain("passport.pdf");
  });
});
