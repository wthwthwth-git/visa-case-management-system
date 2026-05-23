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
          portalVisible: true,
          responsibleParty: "customer",
        },
        include: {
          files: {
            where: {
              portalVisible: true,
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
    },
  });

  return toPortalCaseDTO(visaCase);
}
