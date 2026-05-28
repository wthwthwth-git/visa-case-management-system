import { beforeEach, describe, expect, it, vi } from "vitest";
import { mapRequirementStatusToPortalStatus } from "../types";

const mocks = vi.hoisted(() => {
  const tx = {
    caseDocumentRequirement: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    documentFile: {
      updateMany: vi.fn(),
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
  InvalidRequirementReviewReasonError,
  InvalidRequirementStatusTransitionError,
  RequirementReviewAccessError,
  reviewCaseDocumentRequirement,
} from "./requirement-review-service";

const caseId = "case-review";
const requirementId = "requirement-review";
const updatedAt = new Date("2026-01-01T00:00:00.000Z");

function createRequirement(override = {}) {
  return {
    id: requirementId,
    caseId,
    title: "Passport copy",
    status: "submitted",
    responsibleParty: "customer",
    ...override,
  };
}

describe("requirement review service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback) => callback(mocks.tx));
    mocks.tx.caseDocumentRequirement.findUnique.mockResolvedValue(createRequirement());
    mocks.tx.caseDocumentRequirement.update.mockImplementation(async ({ data }) => ({
      id: requirementId,
      caseId,
      title: "Passport copy",
      status: data.status,
      customerInstruction: data.customerInstruction ?? null,
      internalNote: data.internalNote ?? null,
      updatedAt,
    }));
    mocks.tx.timelineEvent.create.mockImplementation(async ({ data }) => data);
    mocks.tx.documentFile.updateMany.mockResolvedValue({ count: 0 });
  });

  it("reviews submitted to approved without changing the case phase", async () => {
    const result = await reviewCaseDocumentRequirement({
      caseId,
      requirementId,
      newStatus: "approved",
      reason: "checked",
    });
    const updateArg = mocks.tx.caseDocumentRequirement.update.mock.calls[0][0];
    const timelineArg = mocks.tx.timelineEvent.create.mock.calls[0][0].data;

    expect(result.status).toBe("approved");
    expect(updateArg.data).toEqual({
      status: "approved",
    });
    expect(timelineArg.eventType).toBe("requirement_status_changed");
    expect(timelineArg.actorType).toBe("internal");
    expect(timelineArg.targetType).toBe("case_document_requirement");
    expect(timelineArg.metadata).toEqual({
      requirementId,
      oldStatus: "submitted",
      newStatus: "approved",
      reason: "checked",
    });
    expect(JSON.stringify(updateArg.data)).not.toContain("casePhase");
  });

  it("reviews submitted to needs_more and updates customerInstruction", async () => {
    const result = await reviewCaseDocumentRequirement({
      caseId,
      requirementId,
      newStatus: "needs_more",
      customerInstruction: "Please upload a clearer copy.",
    });
    const updateArg = mocks.tx.caseDocumentRequirement.update.mock.calls[0][0];

    expect(result.status).toBe("needs_more");
    expect(result.customerInstruction).toBe("Please upload a clearer copy.");
    expect(updateArg.data).toEqual({
      status: "needs_more",
      customerInstruction: "Please upload a clearer copy.",
    });
  });

  it("rejects not_submitted to approved", async () => {
    mocks.tx.caseDocumentRequirement.findUnique.mockResolvedValue(
      createRequirement({ status: "not_submitted" }),
    );

    await expect(
      reviewCaseDocumentRequirement({
        caseId,
        requirementId,
        newStatus: "approved",
      }),
    ).rejects.toBeInstanceOf(InvalidRequirementStatusTransitionError);
    expect(mocks.tx.caseDocumentRequirement.update).not.toHaveBeenCalled();
    expect(mocks.tx.timelineEvent.create).not.toHaveBeenCalled();
  });

  it("allows approved to needs_more when reason or customerInstruction is provided", async () => {
    mocks.tx.caseDocumentRequirement.findUnique.mockResolvedValue(
      createRequirement({ status: "approved" }),
    );

    const result = await reviewCaseDocumentRequirement({
      caseId,
      requirementId,
      newStatus: "needs_more",
      reason: "newer copy requested",
    });

    expect(result.status).toBe("needs_more");
    expect(mocks.tx.caseDocumentRequirement.update).toHaveBeenCalled();
  });

  it("allows approved to move back to submitted", async () => {
    mocks.tx.caseDocumentRequirement.findUnique.mockResolvedValue(
      createRequirement({ status: "approved" }),
    );

    const result = await reviewCaseDocumentRequirement({
      caseId,
      requirementId,
      newStatus: "submitted",
    });
    const updateArg = mocks.tx.caseDocumentRequirement.update.mock.calls[0][0];
    const timelineMetadata = mocks.tx.timelineEvent.create.mock.calls[0][0].data.metadata;

    expect(result.status).toBe("submitted");
    expect(updateArg.data).toEqual({
      status: "submitted",
    });
    expect(timelineMetadata).toEqual({
      requirementId,
      oldStatus: "approved",
      newStatus: "submitted",
    });
  });

  it("rejects approved to needs_more without reason or customerInstruction", async () => {
    mocks.tx.caseDocumentRequirement.findUnique.mockResolvedValue(
      createRequirement({ status: "approved" }),
    );

    await expect(
      reviewCaseDocumentRequirement({
        caseId,
        requirementId,
        newStatus: "needs_more",
      }),
    ).rejects.toBeInstanceOf(InvalidRequirementStatusTransitionError);
    expect(mocks.tx.caseDocumentRequirement.update).not.toHaveBeenCalled();
    expect(mocks.tx.timelineEvent.create).not.toHaveBeenCalled();
  });

  it("limits office requirements to in-progress or completed states and exposes completed files", async () => {
    mocks.tx.caseDocumentRequirement.findUnique.mockResolvedValue(
      createRequirement({ responsibleParty: "office" }),
    );

    const result = await reviewCaseDocumentRequirement({
      caseId,
      requirementId,
      newStatus: "approved",
    });
    const updateArg = mocks.tx.caseDocumentRequirement.update.mock.calls[0][0];

    expect(result.status).toBe("approved");
    expect(updateArg.data).toEqual({
      status: "approved",
      portalVisible: true,
      portalDownloadable: true,
    });
    expect(mocks.tx.documentFile.updateMany).toHaveBeenCalledWith({
      where: {
        requirementId,
        status: "uploaded",
      },
      data: {
        portalVisible: true,
        portalDownloadable: true,
      },
    });
  });

  it("rejects office requirement customer-review-only statuses", async () => {
    mocks.tx.caseDocumentRequirement.findUnique.mockResolvedValue(
      createRequirement({ responsibleParty: "office" }),
    );

    await expect(
      reviewCaseDocumentRequirement({
        caseId,
        requirementId,
        newStatus: "needs_more",
      }),
    ).rejects.toBeInstanceOf(InvalidRequirementStatusTransitionError);
  });

  it("does not put internalNote or customerInstruction into timeline metadata", async () => {
    await reviewCaseDocumentRequirement({
      caseId,
      requirementId,
      newStatus: "needs_more",
      reason: "unclear scan",
      customerInstruction: "Please upload a clearer copy.",
      internalNote: "Internal reviewer note.",
    });
    const updateArg = mocks.tx.caseDocumentRequirement.update.mock.calls[0][0];
    const timelineMetadata = mocks.tx.timelineEvent.create.mock.calls[0][0].data.metadata;
    const timelinePayload = JSON.stringify(timelineMetadata);

    expect(updateArg.data.internalNote).toBe("Internal reviewer note.");
    expect(Object.keys(timelineMetadata)).toEqual([
      "requirementId",
      "oldStatus",
      "newStatus",
      "reason",
    ]);
    expect(timelinePayload).not.toContain("Internal reviewer note.");
    expect(timelinePayload).not.toContain("Please upload a clearer copy.");
  });

  it("rejects requirements outside the case", async () => {
    mocks.tx.caseDocumentRequirement.findUnique.mockResolvedValue(
      createRequirement({ caseId: "other-case" }),
    );

    await expect(
      reviewCaseDocumentRequirement({
        caseId,
        requirementId,
        newStatus: "approved",
      }),
    ).rejects.toBeInstanceOf(RequirementReviewAccessError);
    expect(mocks.tx.caseDocumentRequirement.update).not.toHaveBeenCalled();
  });

  it("writes requirement_status_changed timeline with only allowed metadata keys", async () => {
    await reviewCaseDocumentRequirement({
      caseId,
      requirementId,
      newStatus: "approved",
      reason: "complete",
    });
    const timelineArg = mocks.tx.timelineEvent.create.mock.calls[0][0].data;

    expect(timelineArg).toMatchObject({
      caseId,
      eventType: "requirement_status_changed",
      actorType: "internal",
      summary: "Requirement status changed.",
      targetType: "case_document_requirement",
      targetId: requirementId,
    });
    expect(Object.keys(timelineArg.metadata)).toEqual([
      "requirementId",
      "oldStatus",
      "newStatus",
      "reason",
    ]);
  });

  it("rejects unsafe reason content", async () => {
    await expect(
      reviewCaseDocumentRequirement({
        caseId,
        requirementId,
        newStatus: "approved",
        reason: "signedUrl should not be here",
      }),
    ).rejects.toBeInstanceOf(InvalidRequirementReviewReasonError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("keeps approved mapped to accepted for Portal display", () => {
    expect(mapRequirementStatusToPortalStatus("approved")).toBe("accepted");
  });
});
