-- CreateEnum
CREATE TYPE "BotStatus" AS ENUM ('STOPPED', 'STARTING', 'RUNNING', 'STOPPING', 'ERROR', 'RESTARTING');

-- CreateEnum
CREATE TYPE "BotRuntime" AS ENUM ('NODEJS', 'PYTHON');

-- CreateEnum
CREATE TYPE "CodeSource" AS ENUM ('UPLOAD', 'GIT');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR');

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL DEFAULT 'admin',
    "passwordHash" TEXT NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bot" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "discordToken" TEXT NOT NULL,
    "containerId" TEXT,
    "containerName" TEXT NOT NULL,
    "status" "BotStatus" NOT NULL DEFAULT 'STOPPED',
    "autoRestart" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastStartedAt" TIMESTAMP(3),
    "lastStoppedAt" TIMESTAMP(3),
    "codeDirectory" TEXT NOT NULL,
    "entryFile" TEXT NOT NULL DEFAULT 'index.js',
    "runtime" "BotRuntime" NOT NULL DEFAULT 'NODEJS',
    "codeSource" "CodeSource" NOT NULL DEFAULT 'UPLOAD',
    "gitRepoUrl" TEXT,
    "gitBranch" TEXT DEFAULT 'main',

    CONSTRAINT "Bot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotEnvVar" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "BotEnvVar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotLog" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "level" "LogLevel" NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotStatusHistory" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "status" "BotStatus" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cpuUsage" DOUBLE PRECISION,
    "memoryUsage" DOUBLE PRECISION,

    CONSTRAINT "BotStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_username_key" ON "Admin"("username");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Bot_containerName_key" ON "Bot"("containerName");

-- CreateIndex
CREATE UNIQUE INDEX "BotEnvVar_botId_key_key" ON "BotEnvVar"("botId", "key");

-- CreateIndex
CREATE INDEX "BotLog_botId_timestamp_idx" ON "BotLog"("botId", "timestamp");

-- CreateIndex
CREATE INDEX "BotStatusHistory_botId_timestamp_idx" ON "BotStatusHistory"("botId", "timestamp");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotEnvVar" ADD CONSTRAINT "BotEnvVar_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotLog" ADD CONSTRAINT "BotLog_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotStatusHistory" ADD CONSTRAINT "BotStatusHistory_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
