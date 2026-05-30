import "dotenv/config";
import { prisma } from "../lib/prisma";
import {
  buildTemplateDescription,
  buildTemplateItemInternalNote,
  loadVisaTemplateCatalog,
  validateVisaTemplateCatalog,
} from "./import-visa-templates-lib";

type SyncSummary = {
  templatesSeen: number;
  templatesUpdated: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsDeleted: number;
  templatesMissing: string[];
};

async function syncVisaTemplates() {
  const catalog = await loadVisaTemplateCatalog();
  validateVisaTemplateCatalog(catalog);

  const summary: SyncSummary = {
    templatesSeen: catalog.templates.length,
    templatesUpdated: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsDeleted: 0,
    templatesMissing: [],
  };

  for (const template of catalog.templates) {
    const existing = await prisma.documentTemplate.findFirst({
      where: {
        templateKey: template.templateKey,
        version: template.version,
      },
      select: {
        id: true,
        items: {
          select: {
            id: true,
            itemKey: true,
          },
        },
      },
    });

    if (!existing) {
      summary.templatesMissing.push(`${template.templateKey}:${template.version}`);
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.documentTemplate.update({
        where: { id: existing.id },
        data: {
          title: template.title,
          templateDescription: buildTemplateDescription(template),
          currentVisaType: template.currentVisaType,
          targetVisaType: template.targetVisaType,
          status: template.status,
        },
      });

      const existingItemsByKey = new Map(existing.items.map((item) => [item.itemKey, item]));
      const catalogItemKeys = new Set(template.items.map((item) => item.itemKey));
      const deleteItemIds = existing.items
        .filter((item) => !catalogItemKeys.has(item.itemKey))
        .map((item) => item.id);

      if (deleteItemIds.length > 0) {
        await tx.documentTemplateItem.deleteMany({
          where: {
            id: {
              in: deleteItemIds,
            },
          },
        });
        summary.itemsDeleted += deleteItemIds.length;
      }

      for (const item of template.items) {
        const data = {
          title: item.title,
          customerInstruction: item.customerInstruction,
          internalNote: buildTemplateItemInternalNote(item),
          isRequired: item.isRequired,
          responsibleParty: item.responsibleParty,
          sortOrder: item.sortOrder,
          acceptedFileTypesDescription: item.acceptedFileTypesDescription,
        };
        const existingItem = existingItemsByKey.get(item.itemKey);

        if (existingItem) {
          await tx.documentTemplateItem.update({
            where: { id: existingItem.id },
            data,
          });
          summary.itemsUpdated += 1;
        } else {
          await tx.documentTemplateItem.create({
            data: {
              templateId: existing.id,
              itemKey: item.itemKey,
              ...data,
            },
          });
          summary.itemsCreated += 1;
        }
      }
    });

    summary.templatesUpdated += 1;
  }

  return summary;
}

syncVisaTemplates()
  .then((summary) => {
    console.log(JSON.stringify(summary, null, 2));
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
