-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'PASSWORD_CHANGED', 'BOT_CREATED', 'BOT_DELETED', 'BOT_STARTED', 'BOT_STOPPED', 'BOT_RESTARTED', 'BOT_UPDATED', 'FILE_UPLOADED', 'FILE_DELETED', 'FILE_MODIFIED', 'WEBHOOK_CREATED', 'WEBHOOK_DELETED', 'SUSPICIOUS_ACTIVITY');

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "userId" TEXT,
    "username" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "resourceName" TEXT,
    "details" JSONB,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_action_timestamp_idx" ON "AuditLog"("action", "timestamp");

-- CreateIndex
CREATE INDEX "AuditLog_userId_timestamp_idx" ON "AuditLog"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "AuditLog_ip_timestamp_idx" ON "AuditLog"("ip", "timestamp");
