-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CasePhase" AS ENUM ('draft', 'collecting_documents', 'preparing_application', 'ready_to_submit', 'submitted', 'additional_documents_requested', 'resubmitted', 'under_review', 'approved', 'rejected', 'closed');

-- CreateEnum
CREATE TYPE "RequirementStatus" AS ENUM ('not_submitted', 'submitted', 'needs_more', 'approved', 'not_applicable');

-- CreateEnum
CREATE TYPE "ResponsibleParty" AS ENUM ('customer', 'office');

-- CreateEnum
CREATE TYPE "RequirementSourceType" AS ENUM ('template', 'custom', 'immigration_request', 'system');

-- CreateEnum
CREATE TYPE "DocumentFileStatus" AS ENUM ('uploaded', 'removed', 'replaced');

-- CreateEnum
CREATE TYPE "TokenStatus" AS ENUM ('active', 'revoked', 'expired');

-- CreateEnum
CREATE TYPE "DocumentTemplateStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "ApplicationConfirmationStatus" AS ENUM ('pending', 'confirmed', 'needs_revision', 'superseded');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('internal', 'client', 'system');

-- CreateEnum
CREATE TYPE "TimelineEventType" AS ENUM ('case_created', 'case_phase_changed', 'token_created', 'token_revoked', 'token_regenerated', 'template_created', 'template_updated', 'template_version_created', 'template_items_copied', 'requirement_created', 'requirement_status_changed', 'file_uploaded', 'file_removed', 'file_replaced', 'internal_note_created', 'internal_note_updated', 'application_confirmation_created', 'application_confirmation_version_created', 'application_confirmation_completed', 'application_confirmation_status_changed');

-- CreateEnum
CREATE TYPE "TimelineTargetType" AS ENUM ('case', 'customer_access_token', 'document_template', 'document_template_item', 'case_document_requirement', 'document_file', 'application_confirmation', 'internal_note');

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "nationality" TEXT,
    "birthday" DATE,
    "passportNumber" TEXT,
    "residenceCardNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Case" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "currentVisaType" TEXT NOT NULL,
    "targetVisaType" TEXT NOT NULL,
    "casePhase" "CasePhase" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAccessToken" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "TokenStatus" NOT NULL DEFAULT 'active',
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerAccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" UUID NOT NULL,
    "templateKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "templateDescription" TEXT,
    "currentVisaType" TEXT,
    "targetVisaType" TEXT,
    "status" "DocumentTemplateStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTemplateItem" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "itemKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "customerInstruction" TEXT,
    "internalNote" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "responsibleParty" "ResponsibleParty" NOT NULL DEFAULT 'customer',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "acceptedFileTypesDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseDocumentRequirement" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "customerInstruction" TEXT,
    "internalNote" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "responsibleParty" "ResponsibleParty" NOT NULL DEFAULT 'customer',
    "sourceType" "RequirementSourceType" NOT NULL DEFAULT 'custom',
    "status" "RequirementStatus" NOT NULL DEFAULT 'not_submitted',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "acceptedFileTypesDescription" TEXT,
    "portalVisible" BOOLEAN NOT NULL DEFAULT false,
    "portalDownloadable" BOOLEAN NOT NULL DEFAULT false,
    "sourceTemplateId" UUID,
    "sourceTemplateVersion" INTEGER,
    "sourceTemplateItemId" UUID,
    "immigrationRequestSource" TEXT,
    "requestedAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseDocumentRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentFile" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "requirementId" UUID NOT NULL,
    "storageBucket" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "status" "DocumentFileStatus" NOT NULL DEFAULT 'uploaded',
    "uploadedByType" "ActorType" NOT NULL,
    "portalVisible" BOOLEAN NOT NULL DEFAULT false,
    "portalDownloadable" BOOLEAN NOT NULL DEFAULT false,
    "removedByType" "ActorType",
    "removeReason" TEXT,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationConfirmation" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "storageBucket" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "status" "ApplicationConfirmationStatus" NOT NULL DEFAULT 'pending',
    "confirmedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternalNote" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "targetType" "TimelineTargetType",
    "targetId" UUID,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InternalNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineEvent" (
    "id" UUID NOT NULL,
    "caseId" UUID,
    "eventType" "TimelineEventType" NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "summary" TEXT NOT NULL,
    "targetType" "TimelineTargetType",
    "targetId" UUID,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "Customer"("name");

-- CreateIndex
CREATE INDEX "Customer_email_idx" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Case_caseNumber_key" ON "Case"("caseNumber");

-- CreateIndex
CREATE INDEX "Case_customerId_idx" ON "Case"("customerId");

-- CreateIndex
CREATE INDEX "Case_casePhase_idx" ON "Case"("casePhase");

-- CreateIndex
CREATE INDEX "Case_currentVisaType_idx" ON "Case"("currentVisaType");

-- CreateIndex
CREATE INDEX "Case_targetVisaType_idx" ON "Case"("targetVisaType");

-- CreateIndex
CREATE INDEX "Case_updatedAt_idx" ON "Case"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAccessToken_tokenHash_key" ON "CustomerAccessToken"("tokenHash");

-- CreateIndex
CREATE INDEX "CustomerAccessToken_caseId_idx" ON "CustomerAccessToken"("caseId");

-- CreateIndex
CREATE INDEX "CustomerAccessToken_status_idx" ON "CustomerAccessToken"("status");

-- CreateIndex
CREATE INDEX "CustomerAccessToken_expiresAt_idx" ON "CustomerAccessToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAccessToken_one_active_per_case" ON "CustomerAccessToken"("caseId") WHERE "status" = 'active';

-- CreateIndex
CREATE INDEX "DocumentTemplate_templateKey_idx" ON "DocumentTemplate"("templateKey");

-- CreateIndex
CREATE INDEX "DocumentTemplate_status_idx" ON "DocumentTemplate"("status");

-- CreateIndex
CREATE INDEX "DocumentTemplate_currentVisaType_targetVisaType_idx" ON "DocumentTemplate"("currentVisaType", "targetVisaType");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTemplate_templateKey_version_key" ON "DocumentTemplate"("templateKey", "version");

-- CreateIndex
CREATE INDEX "DocumentTemplateItem_templateId_sortOrder_idx" ON "DocumentTemplateItem"("templateId", "sortOrder");

-- CreateIndex
CREATE INDEX "DocumentTemplateItem_responsibleParty_idx" ON "DocumentTemplateItem"("responsibleParty");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTemplateItem_templateId_itemKey_key" ON "DocumentTemplateItem"("templateId", "itemKey");

-- CreateIndex
CREATE INDEX "CaseDocumentRequirement_caseId_idx" ON "CaseDocumentRequirement"("caseId");

-- CreateIndex
CREATE INDEX "CaseDocumentRequirement_caseId_responsibleParty_idx" ON "CaseDocumentRequirement"("caseId", "responsibleParty");

-- CreateIndex
CREATE INDEX "CaseDocumentRequirement_caseId_sourceType_idx" ON "CaseDocumentRequirement"("caseId", "sourceType");

-- CreateIndex
CREATE INDEX "CaseDocumentRequirement_caseId_status_idx" ON "CaseDocumentRequirement"("caseId", "status");

-- CreateIndex
CREATE INDEX "CaseDocumentRequirement_caseId_portalVisible_idx" ON "CaseDocumentRequirement"("caseId", "portalVisible");

-- CreateIndex
CREATE INDEX "CaseDocumentRequirement_caseId_sortOrder_idx" ON "CaseDocumentRequirement"("caseId", "sortOrder");

-- CreateIndex
CREATE INDEX "CaseDocumentRequirement_sourceTemplateId_idx" ON "CaseDocumentRequirement"("sourceTemplateId");

-- CreateIndex
CREATE INDEX "CaseDocumentRequirement_sourceTemplateItemId_idx" ON "CaseDocumentRequirement"("sourceTemplateItemId");

-- CreateIndex
CREATE INDEX "CaseDocumentRequirement_dueDate_idx" ON "CaseDocumentRequirement"("dueDate");

-- CreateIndex
CREATE INDEX "DocumentFile_caseId_idx" ON "DocumentFile"("caseId");

-- CreateIndex
CREATE INDEX "DocumentFile_requirementId_idx" ON "DocumentFile"("requirementId");

-- CreateIndex
CREATE INDEX "DocumentFile_requirementId_status_idx" ON "DocumentFile"("requirementId", "status");

-- CreateIndex
CREATE INDEX "DocumentFile_caseId_portalVisible_idx" ON "DocumentFile"("caseId", "portalVisible");

-- CreateIndex
CREATE INDEX "DocumentFile_caseId_portalDownloadable_idx" ON "DocumentFile"("caseId", "portalDownloadable");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentFile_storageBucket_storagePath_key" ON "DocumentFile"("storageBucket", "storagePath");

-- CreateIndex
CREATE INDEX "ApplicationConfirmation_caseId_idx" ON "ApplicationConfirmation"("caseId");

-- CreateIndex
CREATE INDEX "ApplicationConfirmation_caseId_status_idx" ON "ApplicationConfirmation"("caseId", "status");

-- CreateIndex
CREATE INDEX "ApplicationConfirmation_caseId_title_idx" ON "ApplicationConfirmation"("caseId", "title");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationConfirmation_caseId_title_version_key" ON "ApplicationConfirmation"("caseId", "title", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationConfirmation_storageBucket_storagePath_key" ON "ApplicationConfirmation"("storageBucket", "storagePath");

-- CreateIndex
CREATE INDEX "InternalNote_caseId_idx" ON "InternalNote"("caseId");

-- CreateIndex
CREATE INDEX "InternalNote_targetType_targetId_idx" ON "InternalNote"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "InternalNote_createdAt_idx" ON "InternalNote"("createdAt");

-- CreateIndex
CREATE INDEX "TimelineEvent_caseId_createdAt_idx" ON "TimelineEvent"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "TimelineEvent_caseId_eventType_idx" ON "TimelineEvent"("caseId", "eventType");

-- CreateIndex
CREATE INDEX "TimelineEvent_targetType_targetId_idx" ON "TimelineEvent"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "TimelineEvent_actorType_idx" ON "TimelineEvent"("actorType");

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAccessToken" ADD CONSTRAINT "CustomerAccessToken_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTemplateItem" ADD CONSTRAINT "DocumentTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseDocumentRequirement" ADD CONSTRAINT "CaseDocumentRequirement_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentFile" ADD CONSTRAINT "DocumentFile_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentFile" ADD CONSTRAINT "DocumentFile_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "CaseDocumentRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationConfirmation" ADD CONSTRAINT "ApplicationConfirmation_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
