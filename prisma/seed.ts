import "dotenv/config";
import { prisma } from "../lib/prisma";

const seedCustomerEmail = "seed.customer@example.com";
const seedCaseNumber = "SEED-CASE-001";
const seedTemplateKey = "SEED_TEMPLATE_CHANGE_OF_STATUS";
const seedTemplateVersion = 1;
const seedTimelineSummary = "Seed data initialized for Prisma Client verification.";

const templateItems = [
  {
    itemKey: "passport_copy",
    title: "Seed Passport Copy",
    customerInstruction: "Upload a fake passport copy for seed verification only.",
    internalNote: "Seed template item. Do not use for real cases.",
    isRequired: true,
    sortOrder: 10,
    acceptedFileTypesDescription: "PDF, JPG, or PNG",
  },
  {
    itemKey: "residence_card_copy",
    title: "Seed Residence Card Copy",
    customerInstruction: "Upload a fake residence card copy for seed verification only.",
    internalNote: "Seed template item. Do not use for real cases.",
    isRequired: true,
    sortOrder: 20,
    acceptedFileTypesDescription: "PDF, JPG, or PNG",
  },
  {
    itemKey: "application_photo",
    title: "Seed Application Photo",
    customerInstruction: "Upload a fake application photo for seed verification only.",
    internalNote: "Seed template item. Do not use for real cases.",
    isRequired: false,
    sortOrder: 30,
    acceptedFileTypesDescription: "JPG or PNG",
  },
];

async function upsertSeedCustomer() {
  const existing = await prisma.customer.findFirst({
    where: { email: seedCustomerEmail },
  });

  const data = {
    name: "Seed Test Customer",
    email: seedCustomerEmail,
    phone: "000-0000-0000",
    address: "Seed test address",
    nationality: "Seedland",
    birthday: new Date("1990-01-01T00:00:00.000Z"),
    passportNumber: null,
    residenceCardNumber: null,
  };

  if (existing) {
    return prisma.customer.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.customer.create({ data });
}

async function ensureRequirement(input: {
  caseId: string;
  sourceTemplateId: string;
  sourceTemplateItemId: string;
  title: string;
  customerInstruction: string | null;
  internalNote: string | null;
  isRequired: boolean;
  sortOrder: number;
  acceptedFileTypesDescription: string | null;
  sourceTemplateVersion: number;
}) {
  const existing = await prisma.caseDocumentRequirement.findFirst({
    where: {
      caseId: input.caseId,
      title: input.title,
      sourceType: "template",
    },
  });

  const data = {
    customerInstruction: input.customerInstruction,
    internalNote: input.internalNote,
    isRequired: input.isRequired,
    responsibleParty: "customer" as const,
    sourceType: "template" as const,
    status: "not_submitted" as const,
    sortOrder: input.sortOrder,
    acceptedFileTypesDescription: input.acceptedFileTypesDescription,
    portalVisible: true,
    portalDownloadable: false,
    sourceTemplateId: input.sourceTemplateId,
    sourceTemplateVersion: input.sourceTemplateVersion,
    sourceTemplateItemId: input.sourceTemplateItemId,
  };

  if (existing) {
    return prisma.caseDocumentRequirement.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.caseDocumentRequirement.create({
    data: {
      caseId: input.caseId,
      title: input.title,
      ...data,
    },
  });
}

async function main() {
  const customer = await upsertSeedCustomer();

  const visaCase = await prisma.case.upsert({
    where: { caseNumber: seedCaseNumber },
    update: {
      customerId: customer.id,
      currentVisaType: "Seed Current Visa",
      targetVisaType: "Seed Target Visa",
      casePhase: "draft",
    },
    create: {
      customerId: customer.id,
      caseNumber: seedCaseNumber,
      currentVisaType: "Seed Current Visa",
      targetVisaType: "Seed Target Visa",
      casePhase: "draft",
    },
  });

  const template = await prisma.documentTemplate.upsert({
    where: {
      templateKey_version: {
        templateKey: seedTemplateKey,
        version: seedTemplateVersion,
      },
    },
    update: {
      title: "Seed Change of Status Template",
      templateDescription: "Seed template used only to verify Prisma Client writes.",
      currentVisaType: "Seed Current Visa",
      targetVisaType: "Seed Target Visa",
      status: "active",
    },
    create: {
      templateKey: seedTemplateKey,
      version: seedTemplateVersion,
      title: "Seed Change of Status Template",
      templateDescription: "Seed template used only to verify Prisma Client writes.",
      currentVisaType: "Seed Current Visa",
      targetVisaType: "Seed Target Visa",
      status: "active",
    },
  });

  const savedTemplateItems = [];

  for (const item of templateItems) {
    const savedItem = await prisma.documentTemplateItem.upsert({
      where: {
        templateId_itemKey: {
          templateId: template.id,
          itemKey: item.itemKey,
        },
      },
      update: {
        title: item.title,
        customerInstruction: item.customerInstruction,
        internalNote: item.internalNote,
        isRequired: item.isRequired,
        responsibleParty: "customer",
        sortOrder: item.sortOrder,
        acceptedFileTypesDescription: item.acceptedFileTypesDescription,
      },
      create: {
        templateId: template.id,
        itemKey: item.itemKey,
        title: item.title,
        customerInstruction: item.customerInstruction,
        internalNote: item.internalNote,
        isRequired: item.isRequired,
        responsibleParty: "customer",
        sortOrder: item.sortOrder,
        acceptedFileTypesDescription: item.acceptedFileTypesDescription,
      },
    });

    savedTemplateItems.push(savedItem);

    await ensureRequirement({
      caseId: visaCase.id,
      sourceTemplateId: template.id,
      sourceTemplateItemId: savedItem.id,
      title: savedItem.title,
      customerInstruction: savedItem.customerInstruction,
      internalNote: savedItem.internalNote,
      isRequired: savedItem.isRequired,
      sortOrder: savedItem.sortOrder,
      acceptedFileTypesDescription: savedItem.acceptedFileTypesDescription,
      sourceTemplateVersion: template.version,
    });
  }

  await prisma.applicationConfirmation.upsert({
    where: {
      caseId_title_version: {
        caseId: visaCase.id,
        title: "Seed Application Confirmation",
        version: 1,
      },
    },
    update: {
      storageBucket: "seed-only",
      storagePath: `seed/${visaCase.id}/application-confirmation-v1.pdf`,
      status: "pending",
      confirmedAt: null,
      supersededAt: null,
    },
    create: {
      caseId: visaCase.id,
      title: "Seed Application Confirmation",
      version: 1,
      storageBucket: "seed-only",
      storagePath: `seed/${visaCase.id}/application-confirmation-v1.pdf`,
      status: "pending",
    },
  });

  const existingSeedEvent = await prisma.timelineEvent.findFirst({
    where: {
      caseId: visaCase.id,
      eventType: "case_created",
      summary: seedTimelineSummary,
    },
  });

  if (!existingSeedEvent) {
    await prisma.timelineEvent.create({
      data: {
        caseId: visaCase.id,
        eventType: "case_created",
        actorType: "system",
        summary: seedTimelineSummary,
        targetType: "case",
        targetId: visaCase.id,
        metadata: {
          seed: true,
          caseNumber: seedCaseNumber,
          templateKey: seedTemplateKey,
          templateVersion: seedTemplateVersion,
          copiedRequirementCount: savedTemplateItems.length,
        },
      },
    });
  }

  const requirementCount = await prisma.caseDocumentRequirement.count({
    where: { caseId: visaCase.id },
  });

  console.log(
    `Seed completed: customerEmail=${seedCustomerEmail}, caseNumber=${seedCaseNumber}, templateItems=${savedTemplateItems.length}, requirements=${requirementCount}`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
