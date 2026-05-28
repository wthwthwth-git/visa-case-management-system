import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    case: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    caseDocumentRequirement: {
      count: vi.fn(),
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
  InvalidCasePhaseMetadataError,
  InvalidCasePhaseTransitionError,
  changeCasePhase,
} from "./case-phase-service";

const caseId = "case-phase";
const updatedAt = new Date("2026-01-01T00:00:00.000Z");

function mockCurrentPhase(casePhase: string) {
  mocks.tx.case.findUnique.mockResolvedValue({
    id: caseId,
    casePhase,
  });
}

describe("case phase service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback) => callback(mocks.tx));
    mockCurrentPhase("draft");
    mocks.tx.caseDocumentRequirement.count.mockResolvedValue(0);
    mocks.tx.case.update.mockImplementation(async ({ data }) => ({
      id: caseId,
      casePhase: data.casePhase,
      updatedAt,
    }));
    mocks.tx.timelineEvent.create.mockImplementation(async ({ data }) => data);
  });

  it("changes draft to collecting_documents", async () => {
    const result = await changeCasePhase({
      caseId,
      newPhase: "collecting_documents",
    });
    const updateArg = mocks.tx.case.update.mock.calls[0][0];
    const timelineArg = mocks.tx.timelineEvent.create.mock.calls[0][0].data;

    expect(result).toEqual({
      caseId,
      oldPhase: "draft",
      newPhase: "collecting_documents",
      warnings: [],
      updatedAt: updatedAt.toISOString(),
    });
    expect(updateArg.data).toEqual({ casePhase: "collecting_documents" });
    expect(timelineArg.eventType).toBe("case_phase_changed");
    expect(timelineArg.metadata).toEqual({
      oldPhase: "draft",
      newPhase: "collecting_documents",
    });
  });

  it("returns incomplete required document warnings for preparing_application to submitted but still succeeds", async () => {
    mockCurrentPhase("preparing_application");
    mocks.tx.caseDocumentRequirement.count.mockResolvedValue(3);

    const result = await changeCasePhase({
      caseId,
      newPhase: "submitted",
    });
    const timelineMetadata = mocks.tx.timelineEvent.create.mock.calls[0][0].data.metadata;

    expect(result.warnings).toEqual([
      {
        type: "required_requirements_incomplete",
        count: 3,
      },
    ]);
    expect(mocks.tx.case.update).toHaveBeenCalledWith({
      where: { id: caseId },
      data: { casePhase: "submitted" },
      select: {
        id: true,
        casePhase: true,
        updatedAt: true,
      },
    });
    expect(timelineMetadata.warnings).toEqual(result.warnings);
    expect(JSON.stringify(timelineMetadata)).not.toContain("title");
    expect(JSON.stringify(timelineMetadata)).not.toContain("internalNote");
    expect(JSON.stringify(timelineMetadata)).not.toContain("originalFileName");
  });

  it("records submittedAt and submissionNumber for preparing_application to submitted", async () => {
    mockCurrentPhase("preparing_application");
    const submittedAt = new Date("2026-02-01T00:00:00.000Z");

    await changeCasePhase({
      caseId,
      newPhase: "submitted",
      submittedAt,
      submissionNumber: "SUB-001",
    });
    const timelineMetadata = mocks.tx.timelineEvent.create.mock.calls[0][0].data.metadata;

    expect(timelineMetadata).toMatchObject({
      oldPhase: "preparing_application",
      newPhase: "submitted",
      submittedAt: submittedAt.toISOString(),
      submissionNumber: "SUB-001",
    });
  });

  it("changes submitted to approved without creating requirements", async () => {
    mockCurrentPhase("submitted");

    const result = await changeCasePhase({
      caseId,
      newPhase: "approved",
    });

    expect(result.newPhase).toBe("approved");
    expect(mocks.tx.caseDocumentRequirement.create).not.toHaveBeenCalled();
  });

  it("allows submitted to return to collecting_documents without requiring a reason", async () => {
    mockCurrentPhase("submitted");

    const result = await changeCasePhase({
      caseId,
      newPhase: "collecting_documents",
    });

    expect(result.oldPhase).toBe("submitted");
    expect(result.newPhase).toBe("collecting_documents");
  });

  it("records resultAt and reason for submitted to approved", async () => {
    mockCurrentPhase("submitted");
    const resultAt = new Date("2026-03-01T00:00:00.000Z");

    await changeCasePhase({
      caseId,
      newPhase: "approved",
      resultAt,
      reason: "result received",
    });
    const timelineMetadata = mocks.tx.timelineEvent.create.mock.calls[0][0].data.metadata;

    expect(timelineMetadata).toEqual({
      oldPhase: "submitted",
      newPhase: "approved",
      reason: "result received",
      resultAt: resultAt.toISOString(),
    });
  });

  it("allows approved to move back to submitted", async () => {
    mockCurrentPhase("approved");

    const result = await changeCasePhase({
      caseId,
      newPhase: "submitted",
    });

    expect(result.oldPhase).toBe("approved");
    expect(result.newPhase).toBe("submitted");
  });

  it("allows rollback without reason", async () => {
    mockCurrentPhase("submitted");

    const result = await changeCasePhase({
      caseId,
      newPhase: "preparing_application",
    });

    expect(result.oldPhase).toBe("submitted");
    expect(result.newPhase).toBe("preparing_application");
  });

  it("allows draft to approved", async () => {
    mockCurrentPhase("draft");

    const result = await changeCasePhase({
      caseId,
      newPhase: "approved",
    });

    expect(result.oldPhase).toBe("draft");
    expect(result.newPhase).toBe("approved");
  });

  it("rejects changing to the current phase", async () => {
    mockCurrentPhase("submitted");

    await expect(
      changeCasePhase({
        caseId,
        newPhase: "submitted",
      }),
    ).rejects.toBeInstanceOf(InvalidCasePhaseTransitionError);
    expect(mocks.tx.case.update).not.toHaveBeenCalled();
    expect(mocks.tx.timelineEvent.create).not.toHaveBeenCalled();
  });

  it("writes timeline metadata with only allowed keys", async () => {
    mockCurrentPhase("preparing_application");
    mocks.tx.caseDocumentRequirement.count.mockResolvedValue(2);
    const submittedAt = new Date("2026-02-01T00:00:00.000Z");

    await changeCasePhase({
      caseId,
      newPhase: "submitted",
      reason: "manual exception",
      submittedAt,
      submissionNumber: "SUB-002",
    });
    const timelineArg = mocks.tx.timelineEvent.create.mock.calls[0][0].data;

    expect(timelineArg).toMatchObject({
      caseId,
      eventType: "case_phase_changed",
      actorType: "internal",
      summary: "Case phase changed.",
      targetType: "case",
      targetId: caseId,
    });
    expect(Object.keys(timelineArg.metadata)).toEqual([
      "oldPhase",
      "newPhase",
      "reason",
      "warnings",
      "submittedAt",
      "submissionNumber",
    ]);
  });

  it.each([
    ["reason", { reason: "contains signedUrl" }],
    ["reason", { reason: "contains storagePath" }],
    ["submissionNumber", { submissionNumber: "token=abc" }],
    ["submissionNumber", { submissionNumber: "https://example.test/submission" }],
  ])("rejects unsafe %s content", async (_label, input) => {
    await expect(
      changeCasePhase({
        caseId,
        newPhase: "collecting_documents",
        ...input,
      }),
    ).rejects.toBeInstanceOf(InvalidCasePhaseMetadataError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
