import { prisma } from "@/lib/prisma";
import type { PortalCaseDTO } from "../types";
import { toPortalCaseDTO } from "./portal-dto";
import { validatePortalToken } from "./portal-token-service";

export async function getPortalCaseByToken(token: string): Promise<PortalCaseDTO> {
  const tokenContext = await validatePortalToken(token);

  const visaCase = await prisma.case.findUniqueOrThrow({
    where: { id: tokenContext.caseId },
    include: {
      customer: true,
      documentRequirements: {
        where: {
          OR: [
            {
              portalVisible: true,
              responsibleParty: "customer",
            },
            {
              responsibleParty: "office",
              status: {
                in: ["approved", "not_applicable"],
              },
            },
          ],
        },
        include: {
          files: {
            where: {
              status: "uploaded",
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
      applicationConfirmations: {
        orderBy: [{ title: "asc" }, { version: "desc" }],
      },
      timelineEvents: {
        where: {
          eventType: "case_phase_changed",
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  const templateItemIds = Array.from(
    new Set(
      visaCase.documentRequirements
        .filter(
          (requirement) =>
            requirement.responsibleParty === "office" &&
            requirement.sourceType === "template" &&
            requirement.sourceTemplateItemId,
        )
        .map((requirement) => requirement.sourceTemplateItemId as string),
    ),
  );

  const templateItems = templateItemIds.length
    ? await prisma.documentTemplateItem.findMany({
        where: { id: { in: templateItemIds } },
        select: {
          id: true,
          customerInstruction: true,
        },
      })
    : [];

  const templateInstructionByItemId = new Map(
    templateItems.map((item) => [item.id, item.customerInstruction]),
  );

  return toPortalCaseDTO({
    ...visaCase,
    documentRequirements: visaCase.documentRequirements.map((requirement) => ({
      ...requirement,
      sourceTemplateItemCustomerInstruction: requirement.sourceTemplateItemId
        ? (templateInstructionByItemId.get(requirement.sourceTemplateItemId) ?? null)
        : null,
    })),
  });
}
