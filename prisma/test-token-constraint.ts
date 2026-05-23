import "dotenv/config";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

const seedCaseNumber = "SEED-CASE-001";
const testTokenHashes = [
  "seed-token-constraint-active-1",
  "seed-token-constraint-active-2",
  "seed-token-constraint-revoked-1",
  "seed-token-constraint-revoked-2",
  "seed-token-constraint-expired-1",
  "seed-token-constraint-expired-2",
];

async function deleteTestTokens(caseId: string) {
  await prisma.customerAccessToken.deleteMany({
    where: {
      caseId,
      tokenHash: {
        in: testTokenHashes,
      },
    },
  });
}

function isExpectedUniqueConstraintError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2002";
  }

  if (error instanceof Error) {
    return (
      error.message.includes("CustomerAccessToken_one_active_per_case") ||
      error.message.includes("unique") ||
      error.message.includes("duplicate key")
    );
  }

  return false;
}

async function main() {
  const visaCase = await prisma.case.findUnique({
    where: { caseNumber: seedCaseNumber },
  });

  if (!visaCase) {
    throw new Error(`Seed case not found: ${seedCaseNumber}. Run npm run seed first.`);
  }

  await deleteTestTokens(visaCase.id);

  let cleanupError: Error | null = null;

  try {
    await prisma.customerAccessToken.create({
      data: {
        caseId: visaCase.id,
        tokenHash: "seed-token-constraint-active-1",
        status: "active",
      },
    });

    let activeConstraintFailed = false;

    try {
      await prisma.customerAccessToken.create({
        data: {
          caseId: visaCase.id,
          tokenHash: "seed-token-constraint-active-2",
          status: "active",
        },
      });
    } catch (error: unknown) {
      if (!isExpectedUniqueConstraintError(error)) {
        throw error;
      }

      activeConstraintFailed = true;
    }

    if (!activeConstraintFailed) {
      throw new Error("Expected second active token insert to fail, but it succeeded.");
    }

    await prisma.customerAccessToken.createMany({
      data: [
        {
          caseId: visaCase.id,
          tokenHash: "seed-token-constraint-revoked-1",
          status: "revoked",
          revokedAt: new Date(),
        },
        {
          caseId: visaCase.id,
          tokenHash: "seed-token-constraint-revoked-2",
          status: "revoked",
          revokedAt: new Date(),
        },
        {
          caseId: visaCase.id,
          tokenHash: "seed-token-constraint-expired-1",
          status: "expired",
          expiresAt: new Date("2000-01-01T00:00:00.000Z"),
        },
        {
          caseId: visaCase.id,
          tokenHash: "seed-token-constraint-expired-2",
          status: "expired",
          expiresAt: new Date("2000-01-02T00:00:00.000Z"),
        },
      ],
    });

    const [activeCount, revokedCount, expiredCount] = await Promise.all([
      prisma.customerAccessToken.count({
        where: {
          caseId: visaCase.id,
          tokenHash: { in: testTokenHashes },
          status: "active",
        },
      }),
      prisma.customerAccessToken.count({
        where: {
          caseId: visaCase.id,
          tokenHash: { in: testTokenHashes },
          status: "revoked",
        },
      }),
      prisma.customerAccessToken.count({
        where: {
          caseId: visaCase.id,
          tokenHash: { in: testTokenHashes },
          status: "expired",
        },
      }),
    ]);

    if (activeCount !== 1) {
      throw new Error(`Expected exactly one active test token, found ${activeCount}.`);
    }

    if (revokedCount !== 2) {
      throw new Error(`Expected two revoked test tokens, found ${revokedCount}.`);
    }

    if (expiredCount !== 2) {
      throw new Error(`Expected two expired test tokens, found ${expiredCount}.`);
    }

    console.log(
      `Token constraint verified: activeDuplicateRejected=true, active=${activeCount}, revoked=${revokedCount}, expired=${expiredCount}`,
    );
  } finally {
    await deleteTestTokens(visaCase.id);

    const remainingTestTokens = await prisma.customerAccessToken.count({
      where: {
        caseId: visaCase.id,
        tokenHash: {
          in: testTokenHashes,
        },
      },
    });

    console.log(`Token constraint cleanup completed: remainingTestTokens=${remainingTestTokens}`);

    if (remainingTestTokens !== 0) {
      cleanupError = new Error(`Expected remainingTestTokens=0, found ${remainingTestTokens}.`);
    }
  }

  if (cleanupError) {
    throw cleanupError;
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
