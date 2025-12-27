/*
  Warnings:

  - You are about to drop the column `lastActiveTime` on the `test_attempts` table. All the data in the column will be lost.
  - You are about to drop the column `lastSyncTime` on the `test_attempts` table. All the data in the column will be lost.
  - You are about to drop the column `remainingTimeAtSync` on the `test_attempts` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "test_attempts" DROP COLUMN "lastActiveTime",
DROP COLUMN "lastSyncTime",
DROP COLUMN "remainingTimeAtSync";

-- AlterTable
ALTER TABLE "tests" ADD COLUMN     "isDraft" BOOLEAN NOT NULL DEFAULT false;
