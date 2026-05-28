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
      responsibleParty: "customer" as const,
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
          uploadedByType: "internal" as const,
          portalVisible: true,
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
    expect(dto.files[0]?.displayName).toBe("passport.pdf");
    expect(dto.files[0]?.portalDownloadable).toBe(true);
    expect(payload).not.toContain(leakedValue);
    expect(payload).not.toContain("internalNote");
    expect(payload).not.toContain("storagePath");
    expect(payload).not.toContain("storageBucket");
    expect(payload).not.toContain("tokenHash");
    expect(payload).not.toContain("actorId");
    expect(payload).not.toContain("metadata");
    expect(payload).not.toContain("originalFileName");
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
          responsibleParty: "customer" as const,
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
              uploadedByType: "internal" as const,
              portalVisible: true,
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
    expect(dto.requirements[0]?.files[0]?.displayName).toBe("passport.pdf");
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
  });

  it("maps safe submission info without exposing raw timeline metadata", () => {
    const source = {
      id: "case-id",
      caseNumber: "SEED-CASE-001",
      targetVisaType: "Seed Target Visa",
      casePhase: "submitted" as const,
      customer: {
        name: "Seed Test Customer",
      },
      documentRequirements: [],
      applicationConfirmations: [],
      timelineEvents: [
        {
          eventType: "case_phase_changed" as const,
          metadata: {
            submittedAt: "2026-05-20T00:00:00.000Z",
            submissionNumber: "SUB-001",
            storagePath: leakedValue,
            tokenHash: leakedValue,
          },
          createdAt: new Date("2026-05-20T00:00:00.000Z"),
        },
      ],
    };

    const dto = toPortalCaseDTO(source);
    const payload = JSON.stringify(dto);

    expect(dto.submissionInfo).toEqual({
      submittedAt: "2026-05-20T00:00:00.000Z",
      submissionNumber: "SUB-001",
    });
    expect(payload).not.toContain(leakedValue);
    expect(payload).not.toContain("metadata");
    expect(payload).not.toContain("storagePath");
    expect(payload).not.toContain("tokenHash");
  });

  it("lets clients download files they uploaded without exposing raw storage fields", () => {
    const source = {
      id: "requirement-id",
      title: "Passport",
      customerInstruction: null,
      isRequired: true,
      responsibleParty: "customer" as const,
      status: "submitted" as const,
      sourceType: "template" as const,
      portalDownloadable: false,
      files: [
        {
          id: "file-id",
          originalFileName: "passport.pdf",
          mimeType: "application/pdf",
          fileSize: BigInt(1234),
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          uploadedByType: "client" as const,
          portalVisible: true,
          portalDownloadable: true,
          storagePath: leakedValue,
          storageBucket: leakedValue,
        },
      ],
    };

    const dto = toPortalRequirementDTO(source);
    const payload = JSON.stringify(dto);

    expect(dto.files[0]?.portalDownloadable).toBe(true);
    expect(payload).not.toContain(leakedValue);
    expect(payload).not.toContain("storagePath");
    expect(payload).not.toContain("storageBucket");
  });

  it("hides office files from portal until the office requirement is completed", () => {
    const source = {
      id: "office-requirement-id",
      title: "Application form",
      customerInstruction: null,
      isRequired: true,
      responsibleParty: "office" as const,
      status: "submitted" as const,
      sourceType: "template" as const,
      portalDownloadable: true,
      files: [
        {
          id: "office-file-id",
          originalFileName: "office-draft.pdf",
          mimeType: "application/pdf",
          fileSize: BigInt(1234),
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          uploadedByType: "internal" as const,
          portalVisible: true,
          portalDownloadable: true,
          storagePath: leakedValue,
          storageBucket: leakedValue,
        },
      ],
    };

    const dto = toPortalRequirementDTO(source);

    expect(dto.responsibleParty).toBe("office");
    expect(dto.clientStatus).toBe("submitted");
    expect(dto.files).toEqual([]);
  });

  it("shows completed office files as downloadable without exposing raw storage fields", () => {
    const source = {
      id: "office-requirement-id",
      title: "Application form",
      customerInstruction: null,
      isRequired: true,
      responsibleParty: "office" as const,
      status: "approved" as const,
      sourceType: "template" as const,
      portalDownloadable: false,
      files: [
        {
          id: "office-file-id",
          originalFileName: "office-final.pdf",
          mimeType: "application/pdf",
          fileSize: BigInt(1234),
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          uploadedByType: "internal" as const,
          portalVisible: false,
          portalDownloadable: false,
          storagePath: leakedValue,
          storageBucket: leakedValue,
        },
      ],
    };

    const dto = toPortalRequirementDTO(source);
    const payload = JSON.stringify(dto);

    expect(dto.responsibleParty).toBe("office");
    expect(dto.clientStatus).toBe("accepted");
    expect(dto.files[0]?.displayName).toBe("office-final.pdf");
    expect(dto.files[0]?.portalDownloadable).toBe(true);
    expect(payload).not.toContain(leakedValue);
    expect(payload).not.toContain("storagePath");
    expect(payload).not.toContain("storageBucket");
    expect(payload).not.toContain("originalFileName");
  });

  it("shows client-confirmed office files as downloadable without exposing raw storage fields", () => {
    const source = {
      id: "office-requirement-id",
      title: "Application form",
      customerInstruction: null,
      isRequired: true,
      responsibleParty: "office" as const,
      status: "not_applicable" as const,
      sourceType: "template" as const,
      portalDownloadable: false,
      files: [
        {
          id: "office-file-id",
          originalFileName: "office-final.pdf",
          mimeType: "application/pdf",
          fileSize: BigInt(1234),
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          uploadedByType: "internal" as const,
          portalVisible: false,
          portalDownloadable: false,
          storagePath: leakedValue,
          storageBucket: leakedValue,
        },
      ],
    };

    const dto = toPortalRequirementDTO(source);
    const payload = JSON.stringify(dto);

    expect(dto.responsibleParty).toBe("office");
    expect(dto.clientStatus).toBe("not_applicable");
    expect(dto.files[0]?.displayName).toBe("office-final.pdf");
    expect(dto.files[0]?.portalDownloadable).toBe(true);
    expect(payload).not.toContain(leakedValue);
    expect(payload).not.toContain("storagePath");
    expect(payload).not.toContain("storageBucket");
    expect(payload).not.toContain("originalFileName");
  });

  it("excludes in-progress office requirements from the Portal case DTO", () => {
    const source = {
      id: "case-id",
      caseNumber: "CASE-001",
      targetVisaType: "Engineer",
      casePhase: "collecting_documents" as const,
      customer: {
        name: "Seed Customer",
      },
      documentRequirements: [
        {
          id: "office-in-progress-id",
          title: "Office draft",
          customerInstruction: null,
          isRequired: true,
          responsibleParty: "office" as const,
          status: "submitted" as const,
          sourceType: "template" as const,
          portalDownloadable: true,
          files: [
            {
              id: "office-draft-file-id",
              originalFileName: "office-draft.pdf",
              mimeType: "application/pdf",
              fileSize: BigInt(1234),
              createdAt: new Date("2026-01-01T00:00:00.000Z"),
              uploadedByType: "internal" as const,
              portalVisible: true,
              portalDownloadable: true,
            },
          ],
        },
        {
          id: "office-completed-id",
          title: "Office final",
          customerInstruction: null,
          isRequired: true,
          responsibleParty: "office" as const,
          status: "approved" as const,
          sourceType: "template" as const,
          portalDownloadable: true,
          files: [
            {
              id: "office-final-file-id",
              originalFileName: "office-final.pdf",
              mimeType: "application/pdf",
              fileSize: BigInt(1234),
              createdAt: new Date("2026-01-01T00:00:00.000Z"),
              uploadedByType: "internal" as const,
              portalVisible: false,
              portalDownloadable: false,
            },
          ],
        },
      ],
      applicationConfirmations: [],
    };

    const dto = toPortalCaseDTO(source);

    expect(dto.requirements).toHaveLength(1);
    expect(dto.requirements[0]?.id).toBe("office-completed-id");
    expect(JSON.stringify(dto)).not.toContain("office-in-progress-id");
    expect(JSON.stringify(dto)).not.toContain("office-draft.pdf");
  });
});
