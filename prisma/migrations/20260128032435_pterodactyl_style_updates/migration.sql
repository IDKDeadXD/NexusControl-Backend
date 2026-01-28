/*
  Warnings:

  - You are about to drop the column `codeSource` on the `Bot` table. All the data in the column will be lost.
  - You are about to drop the column `discordToken` on the `Bot` table. All the data in the column will be lost.
  - You are about to drop the column `gitBranch` on the `Bot` table. All the data in the column will be lost.
  - You are about to drop the column `gitRepoUrl` on the `Bot` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Bot" DROP COLUMN "codeSource",
DROP COLUMN "discordToken",
DROP COLUMN "gitBranch",
DROP COLUMN "gitRepoUrl",
ADD COLUMN     "cpuLimit" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
ADD COLUMN     "memoryLimit" INTEGER NOT NULL DEFAULT 512,
ADD COLUMN     "startCommand" TEXT;

-- DropEnum
DROP TYPE "CodeSource";
