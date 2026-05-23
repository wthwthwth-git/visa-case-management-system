import "dotenv/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPortalToken } from "../shared/token-hash";
import { InvalidPortalTokenError } from "./portal-errors";
import { validatePortalToken } from "./portal-token-service";

const originalTokenHashSecret = process.env.TOKEN_HASH_SECRET;
const testSecret = "seed-test-token-validation-secret";
const testCustomerEmail = "seed.portal-token-test@example.com";
const testCaseNumber = "SEED-TOKEN-VALIDATION-CASE";
const plaintextTokens = {
  active: "seed-portal-token-active",
  revoked: "seed-portal-token-revoked",
  expiredStatus: "seed-portal-token-expired-status",
  expiredByDate: "seed-portal-token-expired-by-date",
  missing: "seed-portal-token-missing",
};

async function cleanupTestData() {
  const existingCase = await prisma.case.findUnique({
    where: { caseNumber: testCaseNumber },
  });

  if (existingCase) {
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
      name: "Seed Portal Token Test Customer",
      email: testCustomerEmail,
      phone: "000-0000-0000",
      address: "Seed token test address",
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

async function createToken(params: {
  caseId: string;
  plaintextToken: string;
  status: "active" | "revoked" | "expired";
  revokedAt?: Date | null;
  expiresAt?: Date | null;
}) {
  return prisma.customerAccessToken.create({
    data: {
      caseId: params.caseId,
      tokenHash: hashPortalToken(params.plaintextToken, testSecret),
      status: params.status,
      revokedAt: params.revokedAt,
      expiresAt: params.expiresAt,
    },
  });
}

describe("validatePortalToken", () => {
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

  it("validates an active token and updates lastUsedAt", async () => {
    const visaCase = await createTestCase();
    const tokenRecord = await createToken({
      caseId: visaCase.id,
      plaintextToken: plaintextTokens.active,
      status: "active",
    });

    const result = await validatePortalToken(plaintextTokens.active);
    const updatedToken = await prisma.customerAccessToken.findUniqueOrThrow({
      where: { id: tokenRecord.id },
    });

    expect(result).toEqual({
      tokenId: tokenRecord.id,
      caseId: visaCase.id,
    });
    expect(updatedToken.lastUsedAt).toBeInstanceOf(Date);
  });

  it("rejects a revoked token", async () => {
    const visaCase = await createTestCase();
    await createToken({
      caseId: visaCase.id,
      plaintextToken: plaintextTokens.revoked,
      status: "revoked",
      revokedAt: new Date(),
    });

    await expect(validatePortalToken(plaintextTokens.revoked)).rejects.toBeInstanceOf(
      InvalidPortalTokenError,
    );
  });

  it("rejects an expired status token", async () => {
    const visaCase = await createTestCase();
    await createToken({
      caseId: visaCase.id,
      plaintextToken: plaintextTokens.expiredStatus,
      status: "expired",
    });

    await expect(validatePortalToken(plaintextTokens.expiredStatus)).rejects.toBeInstanceOf(
      InvalidPortalTokenError,
    );
  });

  it("rejects an active token with expiresAt in the past", async () => {
    const visaCase = await createTestCase();
    await createToken({
      caseId: visaCase.id,
      plaintextToken: plaintextTokens.expiredByDate,
      status: "active",
      expiresAt: new Date("2000-01-01T00:00:00.000Z"),
    });

    await expect(validatePortalToken(plaintextTokens.expiredByDate)).rejects.toBeInstanceOf(
      InvalidPortalTokenError,
    );
  });

  it("rejects a missing token", async () => {
    await createTestCase();

    await expect(validatePortalToken(plaintextTokens.missing)).rejects.toBeInstanceOf(
      InvalidPortalTokenError,
    );
  });

  it("uses only tokenHash lookup and does not depend on an external caseId", async () => {
    const visaCase = await createTestCase();
    const tokenRecord = await createToken({
      caseId: visaCase.id,
      plaintextToken: plaintextTokens.active,
      status: "active",
    });

    const result = await validatePortalToken(plaintextTokens.active);

    expect(result.tokenId).toBe(tokenRecord.id);
    expect(result.caseId).toBe(visaCase.id);
  });

  it("does not expose sensitive details in invalid token errors", async () => {
    const visaCase = await createTestCase();
    await createToken({
      caseId: visaCase.id,
      plaintextToken: plaintextTokens.revoked,
      status: "revoked",
      revokedAt: new Date(),
    });

    try {
      await validatePortalToken(plaintextTokens.revoked);
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(InvalidPortalTokenError);
      expect((error as Error).message).not.toContain(plaintextTokens.revoked);
      expect((error as Error).message).not.toContain(visaCase.id);
      expect((error as Error).message).not.toContain("revoked");
      expect((error as Error).message).not.toContain("expiresAt");
    }
  });
});
