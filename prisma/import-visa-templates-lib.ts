import { readFile } from "node:fs/promises";
import path from "node:path";
import type { prisma as defaultPrisma } from "../lib/prisma";

export type VisaTemplateCatalog = {
  schemaVersion: number;
  visaTypes: {
    currentVisaTypes: string[];
    targetVisaTypes: string[];
  };
  counts: {
    templateCount: number;
    detailItemCount: number;
    manualReviewItemCount: number;
    customerItemCount: number;
    officeItemCount: number;
  };
  templates: VisaTemplateCatalogTemplate[];
};

export type VisaTemplateCatalogTemplate = {
  sourcePathNo: number;
  templateKey: string;
  version: number;
  title: string;
  currentVisaType: string;
  targetVisaType: string;
  applicationScenario: string;
  status: "active";
  itemCount: number;
  items: VisaTemplateCatalogItem[];
};

export type VisaTemplateCatalogItem = {
  itemKey: string;
  title: string;
  customerInstruction: string | null;
  responsibleParty: "customer" | "office";
  classificationConfidence: "high" | "medium" | "low";
  classificationMatchedPatterns: string[];
  needsManualReview: boolean;
  isRequired: boolean;
  sortOrder: number;
  acceptedFileTypesDescription: string | null;
};

export type ImportVisaTemplatesSummary = {
  createdTemplates: number;
  skippedTemplates: number;
  createdItems: number;
  skippedItems: number;
  manualReviewItems: number;
  failedTemplates: Array<{
    templateKey: string;
    version: number;
    reason: string;
  }>;
  totalTemplatesSeen: number;
  totalItemsSeen: number;
};

export type PrismaLike = Pick<typeof defaultPrisma, "documentTemplate" | "$transaction">;

export type ImportVisaTemplatesOptions = {
  catalog: VisaTemplateCatalog;
  prisma: PrismaLike;
  dryRun?: boolean;
};

export class VisaTemplateCatalogValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VisaTemplateCatalogValidationError";
  }
}

export const defaultCatalogPath = path.join(
  process.cwd(),
  "data",
  "visa-templates",
  "visa-template-catalog.json",
);

export async function loadVisaTemplateCatalog(
  filePath = defaultCatalogPath,
): Promise<VisaTemplateCatalog> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as VisaTemplateCatalog;
}

export function validateVisaTemplateCatalog(catalog: VisaTemplateCatalog): void {
  const errors: string[] = [];
  const templateKeys = new Set<string>();
  const templateKeyVersions = new Set<string>();
  let totalItemsSeen = 0;

  if (catalog.counts.templateCount !== 210) {
    errors.push(`Expected 210 templates, got ${catalog.counts.templateCount}.`);
  }

  if (catalog.visaTypes.currentVisaTypes.length !== 15) {
    errors.push(`Expected 15 current visa types, got ${catalog.visaTypes.currentVisaTypes.length}.`);
  }

  if (catalog.visaTypes.targetVisaTypes.length !== 14) {
    errors.push(`Expected 14 target visa types, got ${catalog.visaTypes.targetVisaTypes.length}.`);
  }

  if (catalog.templates.length !== catalog.counts.templateCount) {
    errors.push("Template array length does not match catalog count.");
  }

  const currentVisaTypes = new Set(catalog.visaTypes.currentVisaTypes);
  const targetVisaTypes = new Set(catalog.visaTypes.targetVisaTypes);

  for (const template of catalog.templates) {
    if (templateKeys.has(template.templateKey)) {
      errors.push(`Duplicate templateKey: ${template.templateKey}.`);
    }
    templateKeys.add(template.templateKey);

    const templateKeyVersion = `${template.templateKey}:${template.version}`;
    if (templateKeyVersions.has(templateKeyVersion)) {
      errors.push(`Duplicate templateKey/version: ${templateKeyVersion}.`);
    }
    templateKeyVersions.add(templateKeyVersion);

    if (!currentVisaTypes.has(template.currentVisaType)) {
      errors.push(`Invalid currentVisaType for ${template.templateKey}.`);
    }

    if (!targetVisaTypes.has(template.targetVisaType)) {
      errors.push(`Invalid targetVisaType for ${template.templateKey}.`);
    }

    if (template.items.length < 1) {
      errors.push(`Template has no items: ${template.templateKey}.`);
    }

    if (template.items.length !== template.itemCount) {
      errors.push(`Item count mismatch for ${template.templateKey}.`);
    }

    const itemKeys = new Set<string>();
    for (const item of template.items) {
      totalItemsSeen += 1;

      if (itemKeys.has(item.itemKey)) {
        errors.push(`Duplicate itemKey ${item.itemKey} in ${template.templateKey}.`);
      }
      itemKeys.add(item.itemKey);

      if (item.responsibleParty !== "customer" && item.responsibleParty !== "office") {
        errors.push(`Invalid responsibleParty ${item.responsibleParty} in ${template.templateKey}.`);
      }
    }
  }

  if (totalItemsSeen !== catalog.counts.detailItemCount) {
    errors.push(`Expected ${catalog.counts.detailItemCount} items, got ${totalItemsSeen}.`);
  }

  if (errors.length > 0) {
    throw new VisaTemplateCatalogValidationError(errors.join("\n"));
  }
}

export function buildTemplateDescription(template: VisaTemplateCatalogTemplate): string {
  return [
    `Application scenario: ${template.applicationScenario}`,
    `Source path no: ${template.sourcePathNo}`,
    "Imported from frozen visa template catalog.",
  ].join("\n");
}

export function buildTemplateItemInternalNote(item: VisaTemplateCatalogItem): string | null {
  const notes = [
    `classification=${item.responsibleParty}`,
    `confidence=${item.classificationConfidence}`,
  ];

  if (item.needsManualReview) {
    notes.push("manualReview=true");
  }

  if (item.classificationMatchedPatterns.length > 0) {
    notes.push(`matchedPatterns=${item.classificationMatchedPatterns.join(", ")}`);
  }

  const note = notes.join("; ");
  assertSafeInternalNote(note);
  return note;
}

export function assertSafeInternalNote(note: string): void {
  const lower = note.toLowerCase();
  const forbidden = [
    "token",
    "tokenhash",
    "signedurl",
    "storagepath",
    "storagebucket",
    "passportnumber",
    "residencecardnumber",
  ];

  for (const keyword of forbidden) {
    if (lower.includes(keyword)) {
      throw new VisaTemplateCatalogValidationError(
        `Unsafe template internalNote contains ${keyword}.`,
      );
    }
  }
}

export function createEmptyImportSummary(catalog: VisaTemplateCatalog): ImportVisaTemplatesSummary {
  return {
    createdTemplates: 0,
    skippedTemplates: 0,
    createdItems: 0,
    skippedItems: 0,
    manualReviewItems: catalog.counts.manualReviewItemCount,
    failedTemplates: [],
    totalTemplatesSeen: catalog.templates.length,
    totalItemsSeen: catalog.templates.reduce((sum, template) => sum + template.items.length, 0),
  };
}

export async function importVisaTemplates(
  options: ImportVisaTemplatesOptions,
): Promise<ImportVisaTemplatesSummary> {
  validateVisaTemplateCatalog(options.catalog);

  const summary = createEmptyImportSummary(options.catalog);

  for (const template of options.catalog.templates) {
    try {
      const existing = await options.prisma.documentTemplate.findFirst({
        where: {
          templateKey: template.templateKey,
          version: template.version,
        },
        select: {
          id: true,
          _count: {
            select: {
              items: true,
            },
          },
        },
      });

      if (existing) {
        summary.skippedTemplates += 1;
        summary.skippedItems += existing._count.items;
        continue;
      }

      if (options.dryRun) {
        summary.createdTemplates += 1;
        summary.createdItems += template.items.length;
        continue;
      }

      await options.prisma.$transaction(async (tx) => {
        await tx.documentTemplate.create({
          data: {
            templateKey: template.templateKey,
            version: template.version,
            title: template.title,
            templateDescription: buildTemplateDescription(template),
            currentVisaType: template.currentVisaType,
            targetVisaType: template.targetVisaType,
            status: "active",
            items: {
              create: template.items.map((item) => ({
                itemKey: item.itemKey,
                title: item.title,
                customerInstruction: item.customerInstruction,
                internalNote: buildTemplateItemInternalNote(item),
                isRequired: item.isRequired,
                responsibleParty: item.responsibleParty,
                sortOrder: item.sortOrder,
                acceptedFileTypesDescription: item.acceptedFileTypesDescription,
              })),
            },
          },
        });
      });

      summary.createdTemplates += 1;
      summary.createdItems += template.items.length;
    } catch (error: unknown) {
      summary.failedTemplates.push({
        templateKey: template.templateKey,
        version: template.version,
        reason: error instanceof Error ? error.message : "Unknown import error.",
      });
    }
  }

  return summary;
}
