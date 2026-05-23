import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    applicationConfirmation: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    timelineEvent: {
      create: vi.fn(),
    },
  };

  return {
    transaction: vi.fn(),
    validatePortalToken: vi.fn(),
    createStorageSignedUrl: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    tx,
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    applicationConfirmation: {
      findUnique: mocks.findUnique,
      findFirst: mocks.findFirst,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("./portal-token-service", () => ({
  validatePortalToken: mocks.validatePortalToken,
}));

vi.mock("../shared/supabase-storage", () => ({
  createStorageSignedUrl: mocks.createStorageSignedUrl,
}));

import {
  InvalidPortalApplicationConfirmationInputError,
  PortalApplicationConfirmationAccessError,
  confirmPortalApplicationConfirmation,
  createPortalApplicationConfirmationSignedUrl,
  requestPortalApplicationConfirmationRevision,
} from "./portal-application-confirmation-service";

const caseId = "case-portal-confirmation";
const confirmationId = "confirmation-id";
const createdAt = new Date("2026-01-01T00:00:00.000Z");
const signedUrl = "https://signed.example.test/application";

function createConfirmation(override = {}) {
  return {
    id: confirmationId,
    caseId,
    title: "Application form",
    version: 2,
    status: "pending",
    confirmedAt: null,
    createdAt,
    storageBucket: "case-files",
    storagePath: "cases/case/application-v2.pdf",
    ...override,
  };
}

describe("portal application confirmation service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.STORAGE_SIGNED_URL_EXPIRES_IN_SECONDS;
    mocks.validatePortalToken.mockResolvedValue({
      tokenId: "token-id",
      caseId,
    });
    mocks.transaction.mockImplementation(async (callback) => callback(mocks.tx));
    mocks.tx.applicationConfirmation.findUnique.mockResolvedValue(createConfirmation());
    mocks.tx.applicationConfirmation.findFirst.mockResolvedValue({ id: confirmationId });
    mocks.tx.applicationConfirmation.update.mockImplementation(async ({ data }) => ({
      id: confirmationId,
      title: "Application form",
      version: 2,
      status: data.status,
      confirmedAt: data.confirmedAt ?? null,
      createdAt,
    }));
    mocks.tx.timelineEvent.create.mockImplementation(async ({ data }) => data);
    mocks.findUnique.mockResolvedValue(createConfirmation());
    mocks.findFirst.mockResolvedValue({ id: confirmationId });
    mocks.createStorageSignedUrl.mockResolvedValue(signedUrl);
  });

  it("confirms the latest actionable confirmation for the token case", async () => {
    const result = await confirmPortalApplicationConfirmation({
      token: "plaintext-test-token",
      confirmationId,
    });
    const updateArg = mocks.tx.applicationConfirmation.update.mock.calls[0][0];
    const completedTimeline = mocks.tx.timelineEvent.create.mock.calls[0][0].data;
    const statusTimeline = mocks.tx.timelineEvent.create.mock.calls[1][0].data;
    const payload = JSON.stringify(result);

    expect(mocks.validatePortalToken).toHaveBeenCalledWith("plaintext-test-token");
    expect(updateArg.data.status).toBe("confirmed");
    expect(updateArg.data.confirmedAt).toBeInstanceOf(Date);
    expect(result.status).toBe("confirmed");
    expect(completedTimeline.eventType).toBe("application_confirmation_completed");
    expect(statusTimeline.eventType).toBe("application_confirmation_status_changed");
    expect(statusTimeline.metadata).toEqual({
      confirmationId,
      title: "Application form",
      version: 2,
      oldStatus: "pending",
      newStatus: "confirmed",
    });
    expect(payload).not.toContain("storageBucket");
    expect(payload).not.toContain("storagePath");
  });

  it("rejects confirmations outside the token case", async () => {
    mocks.tx.applicationConfirmation.findUnique.mockResolvedValue(
      createConfirmation({ caseId: "other-case" }),
    );

    await expect(
      confirmPortalApplicationConfirmation({
        token: "plaintext-test-token",
        confirmationId,
      }),
    ).rejects.toBeInstanceOf(PortalApplicationConfirmationAccessError);
    expect(mocks.tx.applicationConfirmation.update).not.toHaveBeenCalled();
  });

  it("rejects old versions that are not the latest actionable version", async () => {
    mocks.tx.applicationConfirmation.findFirst.mockResolvedValue({ id: "newer-confirmation" });

    await expect(
      confirmPortalApplicationConfirmation({
        token: "plaintext-test-token",
        confirmationId,
      }),
    ).rejects.toBeInstanceOf(PortalApplicationConfirmationAccessError);
  });

  it("rejects confirmed confirmations from any further status change", async () => {
    mocks.tx.applicationConfirmation.findUnique.mockResolvedValue(
      createConfirmation({ status: "confirmed" }),
    );
    mocks.tx.applicationConfirmation.findFirst.mockResolvedValue(null);

    await expect(
      requestPortalApplicationConfirmationRevision({
        token: "plaintext-test-token",
        confirmationId,
        comment: "Please revise.",
      }),
    ).rejects.toBeInstanceOf(PortalApplicationConfirmationAccessError);
    expect(mocks.tx.applicationConfirmation.update).not.toHaveBeenCalled();
  });

  it("marks the latest pending confirmation as needs_revision without storing comment in timeline", async () => {
    const result = await requestPortalApplicationConfirmationRevision({
      token: "plaintext-test-token",
      confirmationId,
      comment: "Please update the address.",
      reason: "client requested revision",
    });
    const updateArg = mocks.tx.applicationConfirmation.update.mock.calls[0][0];
    const timelineMetadata = mocks.tx.timelineEvent.create.mock.calls[0][0].data.metadata;
    const timelinePayload = JSON.stringify(timelineMetadata);

    expect(updateArg.data).toEqual({
      status: "needs_revision",
    });
    expect(result.status).toBe("needs_revision");
    expect(timelineMetadata).toEqual({
      confirmationId,
      title: "Application form",
      version: 2,
      oldStatus: "pending",
      newStatus: "needs_revision",
      reason: "client requested revision",
    });
    expect(timelinePayload).not.toContain("Please update the address.");
    expect(timelinePayload).not.toContain("comment");
  });

  it("rejects unsafe reason or comment content", async () => {
    await expect(
      requestPortalApplicationConfirmationRevision({
        token: "plaintext-test-token",
        confirmationId,
        comment: "contains signedUrl",
      }),
    ).rejects.toBeInstanceOf(InvalidPortalApplicationConfirmationInputError);
    expect(mocks.validatePortalToken).not.toHaveBeenCalled();
  });

  it("creates a signed URL for the token case without returning raw storage fields", async () => {
    const result = await createPortalApplicationConfirmationSignedUrl({
      token: "plaintext-test-token",
      confirmationId,
    });
    const payload = JSON.stringify(result);

    expect(result.signedUrl).toBe(signedUrl);
    expect(mocks.createStorageSignedUrl).toHaveBeenCalledWith({
      bucket: "case-files",
      path: "cases/case/application-v2.pdf",
      expiresInSeconds: 300,
    });
    expect(payload).not.toContain("storageBucket");
    expect(payload).not.toContain("storagePath");
    expect(payload).not.toContain("case-files");
    expect(payload).not.toContain("application-v2.pdf");
    expect(mocks.tx.timelineEvent.create).not.toHaveBeenCalled();
  });
});
