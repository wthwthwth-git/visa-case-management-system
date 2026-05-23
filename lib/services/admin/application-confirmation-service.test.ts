import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    case: {
      findUniqueOrThrow: vi.fn(),
    },
    applicationConfirmation: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
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
  InvalidApplicationConfirmationInputError,
  createApplicationConfirmationVersion,
} from "./application-confirmation-service";

const caseId = "case-application-confirmation";
const createdAt = new Date("2026-01-01T00:00:00.000Z");

function createConfirmationRecord(data: Record<string, unknown>) {
  return {
    id: "confirmation-new",
    caseId,
    title: data.title,
    version: data.version,
    status: data.status,
    confirmedAt: null,
    supersededAt: null,
    createdAt,
    storageBucket: data.storageBucket,
    storagePath: data.storagePath,
  };
}

describe("admin application confirmation service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback) => callback(mocks.tx));
    mocks.tx.case.findUniqueOrThrow.mockResolvedValue({ id: caseId });
    mocks.tx.applicationConfirmation.findFirst.mockResolvedValue(null);
    mocks.tx.applicationConfirmation.findMany.mockResolvedValue([]);
    mocks.tx.applicationConfirmation.updateMany.mockResolvedValue({ count: 0 });
    mocks.tx.applicationConfirmation.create.mockImplementation(async ({ data }) =>
      createConfirmationRecord(data),
    );
    mocks.tx.timelineEvent.create.mockImplementation(async ({ data }) => data);
  });

  it("creates the first confirmation as version 1 pending without returning storage fields", async () => {
    const result = await createApplicationConfirmationVersion({
      caseId,
      title: "Application form",
      storageBucket: "case-files",
      storagePath: "cases/case/application-v1.pdf",
    });
    const createArg = mocks.tx.applicationConfirmation.create.mock.calls[0][0].data;
    const timelineArg = mocks.tx.timelineEvent.create.mock.calls[0][0].data;
    const payload = JSON.stringify(result);

    expect(createArg).toMatchObject({
      caseId,
      title: "Application form",
      version: 1,
      status: "pending",
      storageBucket: "case-files",
      storagePath: "cases/case/application-v1.pdf",
    });
    expect(timelineArg.eventType).toBe("application_confirmation_created");
    expect(timelineArg.metadata).toEqual({
      confirmationId: "confirmation-new",
      title: "Application form",
      version: 1,
    });
    expect(payload).not.toContain("storageBucket");
    expect(payload).not.toContain("storagePath");
    expect(payload).not.toContain("case-files");
  });

  it("creates the next version as max version plus one", async () => {
    mocks.tx.applicationConfirmation.findFirst.mockResolvedValue({ version: 2 });

    await createApplicationConfirmationVersion({
      caseId,
      title: "Application form",
      storageBucket: "case-files",
      storagePath: "cases/case/application-v3.pdf",
    });
    const createArg = mocks.tx.applicationConfirmation.create.mock.calls[0][0].data;
    const timelineArg = mocks.tx.timelineEvent.create.mock.calls[0][0].data;

    expect(createArg.version).toBe(3);
    expect(timelineArg.eventType).toBe("application_confirmation_version_created");
  });

  it("supersedes old pending versions when requested and writes safe timelines", async () => {
    mocks.tx.applicationConfirmation.findFirst.mockResolvedValue({ version: 1 });
    mocks.tx.applicationConfirmation.findMany.mockResolvedValue([
      { id: "confirmation-old-1", version: 1 },
      { id: "confirmation-old-2", version: 2 },
    ]);

    await createApplicationConfirmationVersion({
      caseId,
      title: "Application form",
      storageBucket: "case-files",
      storagePath: "cases/case/application-v2.pdf",
      supersedePendingVersions: true,
      reason: "new version",
    });
    const updateManyArg = mocks.tx.applicationConfirmation.updateMany.mock.calls[0][0];
    const createdTimelineArg = mocks.tx.timelineEvent.create.mock.calls[2][0].data;
    const timelinePayload = JSON.stringify(
      mocks.tx.timelineEvent.create.mock.calls.map((call) => call[0].data.metadata),
    );

    expect(updateManyArg.where.id.in).toEqual(["confirmation-old-1", "confirmation-old-2"]);
    expect(updateManyArg.data.status).toBe("superseded");
    expect(createdTimelineArg.metadata.supersededConfirmationIds).toEqual([
      "confirmation-old-1",
      "confirmation-old-2",
    ]);
    expect(timelinePayload).not.toContain("storagePath");
    expect(timelinePayload).not.toContain("storageBucket");
    expect(timelinePayload).not.toContain("application-v2.pdf");
  });

  it("does not supersede versions unless requested", async () => {
    await createApplicationConfirmationVersion({
      caseId,
      title: "Application form",
      storageBucket: "case-files",
      storagePath: "cases/case/application-v1.pdf",
      supersedePendingVersions: false,
    });

    expect(mocks.tx.applicationConfirmation.findMany).not.toHaveBeenCalled();
    expect(mocks.tx.applicationConfirmation.updateMany).not.toHaveBeenCalled();
  });

  it("rejects unsafe reason content", async () => {
    await expect(
      createApplicationConfirmationVersion({
        caseId,
        title: "Application form",
        storageBucket: "case-files",
        storagePath: "cases/case/application-v1.pdf",
        reason: "contains signedUrl",
      }),
    ).rejects.toBeInstanceOf(InvalidApplicationConfirmationInputError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
