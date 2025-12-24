-- AlterTable
ALTER TABLE "test_attempts" ADD COLUMN     "lastSyncTime" TIMESTAMP(3),
ADD COLUMN     "remainingTimeAtSync" INTEGER;
