import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    case: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    caseDocumentRequirement: {
      create: vi.fn(),
    },
    documentTemplate: {
      create: vi.fn(),
    },
    documentTemplateItem: {
      create: vi.fn(),
    },
    documentFile: {
      create: vi.fn(),
    },
    timelineEvent: {
      create: vi.fn(),
    },
  };

  return {
    transaction: vi.fn(),
    tx,
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));

import {
  InvalidImmigrationRequirementInputError,
  addImmigrationAdditionalRequirement,
} from "./immigration-requirement-service";

const caseId = "case-immigration";
const requirementId = "requirement-immigration";
const createdAt = new Date("2026-01-01T00:00:00.000Z");
const dueDate = new Date("2026-02-01T00:00:00.000Z");

function createRequirementRecord(data: Record<string, unknown>) {
  return {
    id: requirementId,
    caseId,
    title: data.title,
    responsibleParty: data.responsibleParty,
    sourceType: data.sourceType,
    status: data.status,
    portalVisible: data.portalVisible,
    portalDownloadable: data.portalDownloadable,
    customerInstruction: data.customerInstruction ?? null,
    internalNote: data.internalNote ?? null,
    dueDate: data.dueDate ?? null,
    createdAt,
  };
}

describe("immigration additional requirement service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback) => callback(mocks.tx));
    mocks.tx.case.findUnique.mockResolvedValue({
      id: caseId,
      casePhase: "under_review",
    });
    mocks.tx.case.update.mockResolvedValue({});
    mocks.tx.caseDocumentRequirement.create.mockImplementation(async ({ data }) =>
      createRequirementRecord(data),
    );
    mocks.tx.timelineEvent.create.mockImplementation(async ({ data }) => data);
  });

  it("creates a customer immigration request with default portalVisible=true", async () => {
    const result = await addImmigrationAdditionalRequirement({
      caseId,
      title: "Additional bank statement",
      responsibleParty: "customer",
    });
    const createArg = mocks.tx.caseDocumentRequirement.create.mock.calls[0][0].data;

    expect(result.portalVisible).toBe(true);
    expect(result.portalDownloadable).toBe(false);
    expect(createArg.portalVisible).toBe(true);
    expect(createArg.portalDownloadable).toBe(false);
  });

  it("creates an office immigration request with default portalVisible=false", async () => {
    const result = await addImmigrationAdditionalRequirement({
      caseId,
      title: "Office prepared explanation",
      responsibleParty: "office",
    });
    const createArg = mocks.tx.caseDocumentRequirement.create.mock.calls[0][0].data;

    expect(result.portalVisible).toBe(false);
    expect(result.portalDownloadable).toBe(false);
    expect(createArg.portalVisible).toBe(false);
    expect(createArg.portalDownloadable).toBe(false);
  });

  it("forces portalVisible=true when portalDownloadable=true", async () => {
    await addImmigrationAdditionalRequirement({
      caseId,
      title: "Downloadable request",
      responsibleParty: "office",
      portalVisible: false,
      portalDownloadable: true,
    });
    const createArg = mocks.tx.caseDocumentRequirement.create.mock.calls[0][0].data;

    expect(createArg.portalVisible).toBe(true);
    expect(createArg.portalDownloadable).toBe(true);
  });

  it("forces sourceType to immigration_request and status to not_submitted", async () => {
    await addImmigrationAdditionalRequirement({
      caseId,
      title: "Additional photo",
      responsibleParty: "customer",
    });
    const createArg = mocks.tx.caseDocumentRequirement.create.mock.calls[0][0].data;

    expect(createArg.sourceType).toBe("immigration_request");
    expect(createArg.status).toBe("not_submitted");
  });

  it("writes customerInstruction and internalNote to the requirement but not timeline metadata", async () => {
    await addImmigrationAdditionalRequirement({
      caseId,
      title: "Additional certificate",
      responsibleParty: "customer",
      customerInstruction: "Please upload the latest certificate.",
      internalNote: "Call client before sending reminder.",
      reason: "immigration request",
    });
    const createArg = mocks.tx.caseDocumentRequirement.create.mock.calls[0][0].data;
    const timelineMetadata = mocks.tx.timelineEvent.create.mock.calls[0][0].data.metadata;
    const timelinePayload = JSON.stringify(timelineMetadata);

    expect(createArg.customerInstruction).toBe("Please upload the latest certificate.");
    expect(createArg.internalNote).toBe("Call client before sending reminder.");
    expect(Object.keys(timelineMetadata)).toEqual([
      "requirementId",
      "sourceType",
      "responsibleParty",
      "reason",
    ]);
    expect(timelinePayload).not.toContain("latest certificate");
    expect(timelinePayload).not.toContain("Call client");
  });

  it("writes dueDate to requirement and safe timeline metadata", async () => {
    await addImmigrationAdditionalRequirement({
      caseId,
      title: "Additional record",
      responsibleParty: "customer",
      dueDate,
    });
    const createArg = mocks.tx.caseDocumentRequirement.create.mock.calls[0][0].data;
    const timelineMetadata = mocks.tx.timelineEvent.create.mock.calls[0][0].data.metadata;

    expect(createArg.dueDate).toBe(dueDate);
    expect(timelineMetadata.dueDate).toBe(dueDate.toISOString());
  });

  it("writes requirement_created timeline", async () => {
    await addImmigrationAdditionalRequirement({
      caseId,
      title: "Additional tax document",
      responsibleParty: "customer",
      reason: "requested by immigration",
    });
    const timelineArg = mocks.tx.timelineEvent.create.mock.calls[0][0].data;

    expect(timelineArg).toMatchObject({
      caseId,
      eventType: "requirement_created",
      actorType: "internal",
      summary: "Immigration additional requirement created.",
      targetType: "case_document_requirement",
      targetId: requirementId,
    });
    expect(timelineArg.metadata).toEqual({
      requirementId,
      sourceType: "immigration_request",
      responsibleParty: "customer",
      reason: "requested by immigration",
    });
  });

  it("sets case phase and writes case_phase_changed timeline when setCasePhase=true", async () => {
    await addImmigrationAdditionalRequirement({
      caseId,
      title: "Additional employment record",
      responsibleParty: "customer",
      setCasePhase: true,
      reason: "immigration request",
    });
    const phaseTimelineArg = mocks.tx.timelineEvent.create.mock.calls[1][0].data;

    expect(mocks.tx.case.update).toHaveBeenCalledWith({
      where: { id: caseId },
      data: { casePhase: "collecting_documents" },
    });
    expect(phaseTimelineArg).toMatchObject({
      caseId,
      eventType: "case_phase_changed",
      actorType: "internal",
      summary: "Case phase changed.",
      targetType: "case",
      targetId: caseId,
      metadata: {
        oldPhase: "under_review",
        newPhase: "collecting_documents",
        reason: "immigration request",
      },
    });
  });

  it("does not change case phase when setCasePhase=false", async () => {
    await addImmigrationAdditionalRequirement({
      caseId,
      title: "Additional residence record",
      responsibleParty: "customer",
      setCasePhase: false,
    });

    expect(mocks.tx.case.update).not.toHaveBeenCalled();
    expect(mocks.tx.timelineEvent.create).toHaveBeenCalledTimes(1);
  });

  it("does not fill sourceTemplate fields", async () => {
    await addImmigrationAdditionalRequirement({
      caseId,
      title: "Additional statement",
      responsibleParty: "customer",
    });
    const createArg = mocks.tx.caseDocumentRequirement.create.mock.calls[0][0].data;

    expect(createArg).not.toHaveProperty("sourceTemplateId");
    expect(createArg).not.toHaveProperty("sourceTemplateVersion");
    expect(createArg).not.toHaveProperty("sourceTemplateItemId");
  });

  it("does not create templates, template items, or files", async () => {
    await addImmigrationAdditionalRequirement({
      caseId,
      title: "Additional support letter",
      responsibleParty: "customer",
    });

    expect(mocks.tx.documentTemplate.create).not.toHaveBeenCalled();
    expect(mocks.tx.documentTemplateItem.create).not.toHaveBeenCalled();
    expect(mocks.tx.documentFile.create).not.toHaveBeenCalled();
  });

  it("rejects unsafe reason content", async () => {
    await expect(
      addImmigrationAdditionalRequirement({
        caseId,
        title: "Additional support letter",
        responsibleParty: "customer",
        reason: "contains signedUrl",
      }),
    ).rejects.toBeInstanceOf(InvalidImmigrationRequirementInputError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
