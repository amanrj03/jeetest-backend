-- AlterTable
ALTER TABLE "answers" ADD COLUMN     "firstVisitTime" TIMESTAMP(3),
ADD COLUMN     "lastVisitTime" TIMESTAMP(3),
ADD COLUMN     "timeSpent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "visitCount" INTEGER NOT NULL DEFAULT 0;
