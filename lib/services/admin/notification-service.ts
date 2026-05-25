import { prisma } from "@/lib/prisma";
import type {
  AdminNotificationSeverity,
  AdminNotificationStatus,
  AdminNotificationTargetType,
  AdminNotificationType,
} from "@prisma/client";

export type AdminNotificationDTO = {
  id: string;
  caseId: string | null;
  type: AdminNotificationType;
  title: string;
  message: string;
  status: AdminNotificationStatus;
  severity: AdminNotificationSeverity;
  targetType: AdminNotificationTargetType | null;
  targetId: string | null;
  createdAt: string;
  readAt: string | null;
};

export type AdminNotificationListDTO = {
  items: AdminNotificationDTO[];
  page: number;
  pageSize: number;
  total: number;
  unreadCount: number;
};

export type ListAdminNotificationsInput = {
  status?: "unread" | "read" | "archived" | "all";
  page?: string | number;
  pageSize?: string | number;
};

export class AdminNotificationAccessError extends Error {
  constructor(message = "Notification is not accessible.") {
    super(message);
    this.name = "AdminNotificationAccessError";
  }
}

function parsePositiveInteger(value: string | number | undefined, fallback: number) {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }

  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toNotificationDTO(notification: {
  id: string;
  caseId: string | null;
  type: AdminNotificationType;
  title: string;
  message: string;
  status: AdminNotificationStatus;
  severity: AdminNotificationSeverity;
  targetType: AdminNotificationTargetType | null;
  targetId: string | null;
  createdAt: Date;
  readAt: Date | null;
}): AdminNotificationDTO {
  return {
    id: notification.id,
    caseId: notification.caseId,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    status: notification.status,
    severity: notification.severity,
    targetType: notification.targetType,
    targetId: notification.targetId,
    createdAt: notification.createdAt.toISOString(),
    readAt: notification.readAt?.toISOString() ?? null,
  };
}

export async function listAdminNotifications(
  input: ListAdminNotificationsInput = {},
): Promise<AdminNotificationListDTO> {
  const page = parsePositiveInteger(input.page, 1);
  const pageSize = Math.min(parsePositiveInteger(input.pageSize, 10), 50);
  const status = input.status && input.status !== "all" ? input.status : undefined;
  const where = status ? { status } : {};

  const [items, total, unreadCount] = await Promise.all([
    prisma.adminNotification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        caseId: true,
        type: true,
        title: true,
        message: true,
        status: true,
        severity: true,
        targetType: true,
        targetId: true,
        createdAt: true,
        readAt: true,
      },
    }),
    prisma.adminNotification.count({ where }),
    prisma.adminNotification.count({ where: { status: "unread" } }),
  ]);

  return {
    items: items.map(toNotificationDTO),
    page,
    pageSize,
    total,
    unreadCount,
  };
}

export async function markAdminNotificationRead(
  notificationId: string,
): Promise<AdminNotificationDTO> {
  const existing = await prisma.adminNotification.findUnique({
    where: { id: notificationId },
    select: { id: true, status: true },
  });

  if (!existing) {
    throw new AdminNotificationAccessError();
  }

  const notification = await prisma.adminNotification.update({
    where: { id: notificationId },
    data:
      existing.status === "read"
        ? {}
        : {
            status: "read",
            readAt: new Date(),
          },
    select: {
      id: true,
      caseId: true,
      type: true,
      title: true,
      message: true,
      status: true,
      severity: true,
      targetType: true,
      targetId: true,
      createdAt: true,
      readAt: true,
    },
  });

  return toNotificationDTO(notification);
}

export async function markAllAdminNotificationsRead(): Promise<{ updatedCount: number }> {
  const result = await prisma.adminNotification.updateMany({
    where: { status: "unread" },
    data: {
      status: "read",
      readAt: new Date(),
    },
  });

  return { updatedCount: result.count };
}
