/*
  Warnings:

  - The values [MCQ] on the enum `QuestionType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "QuestionType_new" AS ENUM ('SINGLE_CORRECT', 'INTEGER', 'MULTIPLE_CORRECT', 'MATRIX_MATCH');
ALTER TABLE "sections" ALTER COLUMN "questionType" TYPE "QuestionType_new" USING ("questionType"::text::"QuestionType_new");
ALTER TYPE "QuestionType" RENAME TO "QuestionType_old";
ALTER TYPE "QuestionType_new" RENAME TO "QuestionType";
DROP TYPE "QuestionType_old";
COMMIT;

-- AlterTable
ALTER TABLE "answers" ADD COLUMN     "selectedOptions" TEXT;

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "correctOptions" TEXT,
ADD COLUMN     "partialMarks1" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "partialMarks2" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "partialMarks3" INTEGER NOT NULL DEFAULT 0;
