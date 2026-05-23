import type { AdminAuthAuditEventType, AdminAuthAuditResult, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const forbiddenMetadataKeys = new Set([
  "password",
  "sessionToken",
  "csrfToken",
  "portalToken",
  "token",
  "tokenHash",
  "signedUrl",
  "storagePath",
  "storageBucket",
  "secret",
  "cookie",
  "authorization",
]);

function sanitizeMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!metadata) {
    return undefined;
  }

  const safeEntries = Object.entries(metadata).filter(([key, value]) => {
    const normalizedKey = key.trim().toLowerCase();

    if ([...forbiddenMetadataKeys].some((forbiddenKey) => normalizedKey.includes(forbiddenKey.toLowerCase()))) {
      return false;
    }

    return typeof value !== "string" || !/(token=|x-amz-signature|signedurl|storagepath|storagebucket)/i.test(value);
  });

  return Object.fromEntries(safeEntries);
}

export async function writeAdminAuthAudit(input: {
  adminUserId?: string | null;
  email?: string | null;
  eventType: AdminAuthAuditEventType;
  result: AdminAuthAuditResult;
  requestPath?: string | null;
  method?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.adminAuthAudit.create({
      data: {
        adminUserId: input.adminUserId ?? null,
        email: input.email ? input.email.trim().toLowerCase() : null,
        eventType: input.eventType,
        result: input.result,
        requestPath: input.requestPath ?? null,
        method: input.method ?? null,
        reason: input.reason ?? null,
        metadata: sanitizeMetadata(input.metadata) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch {
    // Auth audit must never block login/logout or leak internal database details.
  }
}
