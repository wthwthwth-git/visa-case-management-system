import "dotenv/config";
import { prisma } from "../lib/prisma";
import {
  importVisaTemplates,
  loadVisaTemplateCatalog,
  validateVisaTemplateCatalog,
} from "./import-visa-templates-lib";

function isDryRun(): boolean {
  return process.argv.includes("--dry-run");
}

async function getPostImportValidation() {
  const [versionOneTemplateCount, itemCount, customerItemCount, officeItemCount, samples] =
    await Promise.all([
      prisma.documentTemplate.count({
        where: {
          templateKey: {
            startsWith: "visa-path-",
          },
          version: 1,
        },
      }),
      prisma.documentTemplateItem.count({
        where: {
          template: {
            templateKey: {
              startsWith: "visa-path-",
            },
            version: 1,
          },
        },
      }),
      prisma.documentTemplateItem.count({
        where: {
          responsibleParty: "customer",
          template: {
            templateKey: {
              startsWith: "visa-path-",
            },
            version: 1,
          },
        },
      }),
      prisma.documentTemplateItem.count({
        where: {
          responsibleParty: "office",
          template: {
            templateKey: {
              startsWith: "visa-path-",
            },
            version: 1,
          },
        },
      }),
      prisma.documentTemplate.findMany({
        where: {
          templateKey: {
            in: ["visa-path-001", "visa-path-015", "visa-path-016", "visa-path-210"],
          },
          version: 1,
        },
        orderBy: {
          templateKey: "asc",
        },
        select: {
          templateKey: true,
          title: true,
          currentVisaType: true,
          targetVisaType: true,
          _count: {
            select: {
              items: true,
            },
          },
        },
      }),
    ]);

  return {
    versionOneTemplateCount,
    itemCount,
    customerItemCount,
    officeItemCount,
    samples,
  };
}

async function main() {
  const dryRun = isDryRun();
  const catalog = await loadVisaTemplateCatalog();
  validateVisaTemplateCatalog(catalog);

  const summary = await importVisaTemplates({
    catalog,
    prisma,
    dryRun,
  });

  const output: Record<string, unknown> = {
    mode: dryRun ? "dry-run" : "import",
    catalogValidation: {
      templates: catalog.counts.templateCount,
      detailItems: catalog.counts.detailItemCount,
      currentVisaTypes: catalog.visaTypes.currentVisaTypes.length,
      targetVisaTypes: catalog.visaTypes.targetVisaTypes.length,
      customerItems: catalog.counts.customerItemCount,
      officeItems: catalog.counts.officeItemCount,
      manualReviewItems: catalog.counts.manualReviewItemCount,
    },
    summary,
  };

  if (!dryRun) {
    output.postImportValidation = await getPostImportValidation();
  }

  console.log(JSON.stringify(output, null, 2));

  if (summary.failedTemplates.length > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    console.error(
      JSON.stringify(
        {
          error: error instanceof Error ? error.name : "UnknownError",
          message: error instanceof Error ? error.message : "Unknown import failure.",
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
