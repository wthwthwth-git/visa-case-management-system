import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { assertSafeTimelineMetadata } from "./sensitive-metadata";

type NotificationClient = typeof prisma | Prisma.TransactionClient;

export type CreateAdminNotificationInput = {
  caseId?: string | null;
  type:
    | "portal_file_uploaded"
    | "application_confirmation_confirmed"
    | "application_confirmation_revision_requested"
    | "portal_rate_limit_triggered";
  title: string;
  message: string;
  severity?: "info" | "warning" | "critical";
  targetType?:
    | "case"
    | "case_document_requirement"
    | "document_file"
    | "application_confirmation"
    | "customer_access_token"
    | "security"
    | null;
  targetId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

async function getNotificationCustomerName(
  caseId: string | null | undefined,
  client: NotificationClient,
) {
  if (!caseId) {
    return "客户";
  }

  const visaCase = await client.case.findUnique({
    where: { id: caseId },
    select: {
      customer: {
        select: {
          name: true,
        },
      },
    },
  });

  return visaCase?.customer.name.trim() || "客户";
}

async function getRequirementTitle(
  requirementId: string | null | undefined,
  client: NotificationClient,
) {
  if (!requirementId) {
    return "资料";
  }

  const requirement = await client.caseDocumentRequirement.findUnique({
    where: { id: requirementId },
    select: { title: true },
  });

  return requirement?.title.trim() || "资料";
}

async function getApplicationConfirmationTitle(
  confirmationId: string | null | undefined,
  client: NotificationClient,
) {
  if (!confirmationId) {
    return "完成资料";
  }

  const confirmation = await client.applicationConfirmation.findUnique({
    where: { id: confirmationId },
    select: {
      title: true,
      version: true,
    },
  });

  if (!confirmation) {
    return "完成资料";
  }

  return `${confirmation.title.trim()} v${confirmation.version}`;
}

async function buildNotificationText(input: CreateAdminNotificationInput, client: NotificationClient) {
  if (
    input.type !== "portal_file_uploaded" &&
    input.type !== "application_confirmation_confirmed" &&
    input.type !== "application_confirmation_revision_requested"
  ) {
    return {
      title: input.title,
      message: input.message,
    };
  }

  const customerName = await getNotificationCustomerName(input.caseId, client);

  if (input.type === "portal_file_uploaded") {
    const requirementTitle = await getRequirementTitle(input.targetId, client);
    const text = `${customerName} 提交了资料：${requirementTitle}`;
    return { title: text, message: text };
  }

  if (input.targetType === "case_document_requirement") {
    const requirementTitle = await getRequirementTitle(input.targetId, client);
    const action =
      input.type === "application_confirmation_confirmed"
        ? "确认了事务所资料"
        : "要求修改事务所资料";
    const text = `${customerName} ${action}：${requirementTitle}`;
    return { title: text, message: text };
  }

  const confirmationTitle = await getApplicationConfirmationTitle(input.targetId, client);
  const action =
    input.type === "application_confirmation_confirmed" ? "确认了完成资料" : "要求修改完成资料";
  const text = `${customerName} ${action}：${confirmationTitle}`;
  return { title: text, message: text };
}

export async function createAdminNotification(
  input: CreateAdminNotificationInput,
  client: NotificationClient = prisma,
) {
  assertSafeTimelineMetadata(input.metadata);
  const text = await buildNotificationText(input, client);

  return client.adminNotification.create({
    data: {
      caseId: input.caseId ?? null,
      type: input.type,
      title: text.title,
      message: text.message,
      severity: input.severity ?? "info",
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    },
  });
}
