import "dotenv/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPortalToken } from "../shared/token-hash";
import {
  ActivePortalTokenExistsError,
  InvalidTokenReasonError,
  createPortalTokenForCase,
  regeneratePortalTokenForCase,
  revokeActivePortalTokenForCase,
} from "./portal-token-service";

const originalTokenHashSecret = process.env.TOKEN_HASH_SECRET;
const testSecret = "seed-test-admin-token-service-secret";
const testCustomerEmail = "seed.admin-token-service@example.com";
const testCaseNumber = "SEED-ADMIN-TOKEN-SERVICE-CASE";

async function cleanupTestData() {
  const existingCase = await prisma.case.findUnique({
    where: { caseNumber: testCaseNumber },
  });

  if (existingCase) {
    await prisma.timelineEvent.deleteMany({
      where: { caseId: existingCase.id },
    });
    await prisma.customerAccessToken.deleteMany({
      where: { caseId: existingCase.id },
    });
    await prisma.case.delete({
      where: { id: existingCase.id },
    });
  }

  await prisma.customer.deleteMany({
    where: { email: testCustomerEmail },
  });
}

async function createTestCase() {
  const customer = await prisma.customer.create({
    data: {
      name: "Seed Admin Token Service Customer",
      email: testCustomerEmail,
      phone: "000-0000-0000",
      address: "Seed token service address",
      nationality: "Seedland",
      birthday: new Date("1990-01-01T00:00:00.000Z"),
      passportNumber: null,
      residenceCardNumber: null,
    },
  });

  return prisma.case.create({
    data: {
      customerId: customer.id,
      caseNumber: testCaseNumber,
      currentVisaType: "Seed Current Visa",
      targetVisaType: "Seed Target Visa",
      casePhase: "draft",
    },
  });
}

async function getTimelinePayload(caseId: string) {
  const events = await prisma.timelineEvent.findMany({
    where: { caseId },
    orderBy: { createdAt: "asc" },
  });

  return JSON.stringify(events.map((event) => event.metadata));
}

describe("admin portal token service", () => {
  beforeAll(async () => {
    process.env.TOKEN_HASH_SECRET = testSecret;
    await cleanupTestData();
  });

  beforeEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();

    if (originalTokenHashSecret === undefined) {
      delete process.env.TOKEN_HASH_SECRET;
    } else {
      process.env.TOKEN_HASH_SECRET = originalTokenHashSecret;
    }

    await prisma.$disconnect();
  });

  it("creates an active token, stores only hash, and writes safe timeline metadata", async () => {
    const visaCase = await createTestCase();
    const result = await createPortalTokenForCase({
      caseId: visaCase.id,
      reason: "initial link",
    });

    const tokenRecord = await prisma.customerAccessToken.findUniqueOrThrow({
      where: { id: result.tokenId },
    });
    const timeline = await prisma.timelineEvent.findFirstOrThrow({
      where: {
        caseId: visaCase.id,
        eventType: "token_created",
      },
    });
    const timelinePayload = JSON.stringify(timeline.metadata);
    const expectedHash = hashPortalToken(result.plaintextToken, testSecret);

    expect(result.plaintextToken).toHaveLength(43);
    expect(tokenRecord.tokenHash).toBe(expectedHash);
    expect(tokenRecord.tokenHash).not.toBe(result.plaintextToken);
    expect(tokenRecord.status).toBe("active");
    expect(timeline.targetId).toBe(result.tokenId);
    expect(timelinePayload).not.toContain(result.plaintextToken);
    expect(timelinePayload).not.toContain(tokenRecord.tokenHash);
  });

  it("rejects create when an active token already exists", async () => {
    const visaCase = await createTestCase();
    await createPortalTokenForCase({ caseId: visaCase.id });

    await expect(createPortalTokenForCase({ caseId: visaCase.id })).rejects.toBeInstanceOf(
      ActivePortalTokenExistsError,
    );
  });

  it("regenerates by revoking old active token, creating new active token, and keeping history", async () => {
    const visaCase = await createTestCase();
    const original = await createPortalTokenForCase({
      caseId: visaCase.id,
      reason: "initial link",
    });
    const regenerated = await regeneratePortalTokenForCase({
      caseId: visaCase.id,
      reason: "client requested new link",
    });

    const [originalToken, newToken, activeCount, revokedCount, timelineEvents] =
      await Promise.all([
        prisma.customerAccessToken.findUniqueOrThrow({ where: { id: original.tokenId } }),
        prisma.customerAccessToken.findUniqueOrThrow({ where: { id: regenerated.newTokenId } }),
        prisma.customerAccessToken.count({
          where: { caseId: visaCase.id, status: "active" },
        }),
        prisma.customerAccessToken.count({
          where: { caseId: visaCase.id, status: "revoked" },
        }),
        prisma.timelineEvent.findMany({
          where: {
            caseId: visaCase.id,
            eventType: { in: ["token_revoked", "token_regenerated"] },
          },
        }),
      ]);
    const timelinePayload = await getTimelinePayload(visaCase.id);

    expect(regenerated.previousTokenId).toBe(original.tokenId);
    expect(originalToken.status).toBe("revoked");
    expect(originalToken.revokedAt).toBeInstanceOf(Date);
    expect(newToken.status).toBe("active");
    expect(activeCount).toBe(1);
    expect(revokedCount).toBe(1);
    expect(timelineEvents.some((event) => event.eventType === "token_revoked")).toBe(true);
    expect(timelineEvents.some((event) => event.eventType === "token_regenerated")).toBe(true);
    expect(timelinePayload).not.toContain(original.plaintextToken);
    expect(timelinePayload).not.toContain(regenerated.plaintextToken);
    expect(timelinePayload).not.toContain(originalToken.tokenHash);
    expect(timelinePayload).not.toContain(newToken.tokenHash);
  });

  it("revokes the active token and writes token_revoked timeline", async () => {
    const visaCase = await createTestCase();
    const created = await createPortalTokenForCase({ caseId: visaCase.id });
    const result = await revokeActivePortalTokenForCase({
      caseId: visaCase.id,
      reason: "manual revoke",
    });

    const tokenRecord = await prisma.customerAccessToken.findUniqueOrThrow({
      where: { id: created.tokenId },
    });
    const revokedEvent = await prisma.timelineEvent.findFirst({
      where: {
        caseId: visaCase.id,
        eventType: "token_revoked",
        targetId: created.tokenId,
      },
    });

    expect(result.revokedTokenId).toBe(created.tokenId);
    expect(tokenRecord.status).toBe("revoked");
    expect(tokenRecord.revokedAt).toBeInstanceOf(Date);
    expect(revokedEvent).not.toBeNull();
  });

  it("returns null when there is no active token to revoke", async () => {
    const visaCase = await createTestCase();

    const result = await revokeActivePortalTokenForCase({
      caseId: visaCase.id,
      reason: "no active link",
    });

    const revokedEvents = await prisma.timelineEvent.count({
      where: {
        caseId: visaCase.id,
        eventType: "token_revoked",
      },
    });

    expect(result.revokedTokenId).toBeNull();
    expect(revokedEvents).toBe(0);
  });

  it("rejects unsafe reason content", async () => {
    const visaCase = await createTestCase();

    await expect(
      createPortalTokenForCase({
        caseId: visaCase.id,
        reason: "contains token value",
      }),
    ).rejects.toBeInstanceOf(InvalidTokenReasonError);
  });
});
