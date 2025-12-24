-- AlterTable
ALTER TABLE "test_attempts" ADD COLUMN     "canResume" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "needsResume" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "resumeRequestedAt" TIMESTAMP(3);
