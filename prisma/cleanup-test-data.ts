import "dotenv/config";
import { Prisma } from "@prisma/client";

const TEST_CASE_PREFIXES = ["E2E-", "QA-", "TEST-", "AUTO-QA-"];
const TEST_CUSTOMER_PREFIXES = ["E2E ", "QA ", "TEST ", "AUTO-QA "];
const TEST_EMAIL_SUFFIXES = [
  "@example.invalid",
  "@e2e.invalid",
  "@qa.invalid",
  "@test.invalid",
];

const execute = process.argv.includes("--execute");
const dryRun = process.argv.includes("--dry-run") || !execute;

const testCustomerWhere: Prisma.CustomerWhereInput = {
  OR: [
    ...TEST_CUSTOMER_PREFIXES.map((prefix) => ({ name: { startsWith: prefix } })),
    ...TEST_EMAIL_SUFFIXES.map((suffix) => ({ email: { endsWith: suffix } })),
  ],
};

const testCaseWhere: Prisma.CaseWhereInput = {
  OR: [
    ...TEST_CASE_PREFIXES.map((prefix) => ({ caseNumber: { startsWith: prefix } })),
    { customer: { is: testCustomerWhere } },
  ],
};

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("DATABASE_URL is missing. Cleanup skipped.");
    return;
  }

  const { prisma } = await import("../lib/prisma");

  if (execute && process.env.CLEANUP_TEST_DATA !== "1") {
    throw new Error("Refusing cleanup without CLEANUP_TEST_DATA=1.");
  }

  const cases = await prisma.case.findMany({
    where: testCaseWhere,
    select: {
      id: true,
      caseNumber: true,
      customer: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const customerIds = [...new Set(cases.map((item) => item.customer.id))];

  console.log(
    JSON.stringify(
      {
        mode: dryRun ? "dry-run" : "execute",
        matchedCases: cases.length,
        matchedCustomersFromCases: customerIds.length,
        caseNumbers: cases.map((item) => item.caseNumber).slice(0, 20),
      },
      null,
      2,
    ),
  );

  if (dryRun) {
    console.log(
      "Dry run only. Re-run with CLEANUP_TEST_DATA=1 and --execute to delete matching test cases/customers.",
    );
    return;
  }

  if (cases.length > 0) {
    await prisma.case.deleteMany({
      where: { id: { in: cases.map((item) => item.id) } },
    });
  }

  const deletedCustomers = await prisma.customer.deleteMany({
    where: {
      AND: [testCustomerWhere, { cases: { none: {} } }],
    },
  });

  console.log(
    JSON.stringify(
      {
        deletedCases: cases.length,
        deletedCustomers: deletedCustomers.count,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Cleanup failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    if (process.env.DATABASE_URL) {
      const { prisma } = await import("../lib/prisma");
      await prisma.$disconnect();
    }
  });
