-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('admin');

-- CreateEnum
CREATE TYPE "AdminUserStatus" AS ENUM ('active', 'disabled');

-- CreateEnum
CREATE TYPE "AdminAuthAuditEventType" AS ENUM ('login_success', 'login_failure', 'logout', 'session_expired', 'csrf_failure', 'rate_limit_triggered', 'suspicious_admin_request');

-- CreateEnum
CREATE TYPE "AdminAuthAuditResult" AS ENUM ('success', 'failure', 'blocked');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "role" "AdminRole" NOT NULL DEFAULT 'admin',
    "status" "AdminUserStatus" NOT NULL DEFAULT 'active',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "AdminAuthAudit" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT,
    "email" TEXT,
    "eventType" "AdminAuthAuditEventType" NOT NULL,
    "result" "AdminAuthAuditResult" NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestPath" TEXT,
    "method" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminAuthAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expires_idx" ON "Session"("expires");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "VerificationToken_expires_idx" ON "VerificationToken"("expires");

-- CreateIndex
CREATE INDEX "AdminAuthAudit_adminUserId_createdAt_idx" ON "AdminAuthAudit"("adminUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuthAudit_email_createdAt_idx" ON "AdminAuthAudit"("email", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuthAudit_eventType_createdAt_idx" ON "AdminAuthAudit"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuthAudit_result_createdAt_idx" ON "AdminAuthAudit"("result", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuthAudit_createdAt_idx" ON "AdminAuthAudit"("createdAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuthAudit" ADD CONSTRAINT "AdminAuthAudit_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
