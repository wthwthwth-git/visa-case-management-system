-- Add independent admin notification work-queue tables.
-- Notifications are operational reminders and are intentionally separate from TimelineEvent audit history.

CREATE TYPE "AdminNotificationType" AS ENUM (
  'portal_file_uploaded',
  'application_confirmation_confirmed',
  'application_confirmation_revision_requested',
  'portal_rate_limit_triggered'
);

CREATE TYPE "AdminNotificationStatus" AS ENUM (
  'unread',
  'read',
  'archived'
);

CREATE TYPE "AdminNotificationSeverity" AS ENUM (
  'info',
  'warning',
  'critical'
);

CREATE TYPE "AdminNotificationTargetType" AS ENUM (
  'case',
  'case_document_requirement',
  'document_file',
  'application_confirmation',
  'customer_access_token',
  'security'
);

CREATE TABLE "AdminNotification" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "caseId" UUID,
  "type" "AdminNotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "status" "AdminNotificationStatus" NOT NULL DEFAULT 'unread',
  "severity" "AdminNotificationSeverity" NOT NULL DEFAULT 'info',
  "targetType" "AdminNotificationTargetType",
  "targetId" UUID,
  "metadata" JSONB,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AdminNotification_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AdminNotification"
  ADD CONSTRAINT "AdminNotification_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "AdminNotification_caseId_createdAt_idx" ON "AdminNotification"("caseId", "createdAt");
CREATE INDEX "AdminNotification_status_createdAt_idx" ON "AdminNotification"("status", "createdAt");
CREATE INDEX "AdminNotification_type_createdAt_idx" ON "AdminNotification"("type", "createdAt");
CREATE INDEX "AdminNotification_severity_createdAt_idx" ON "AdminNotification"("severity", "createdAt");
CREATE INDEX "AdminNotification_targetType_targetId_idx" ON "AdminNotification"("targetType", "targetId");
CREATE INDEX "AdminNotification_createdAt_idx" ON "AdminNotification"("createdAt");
