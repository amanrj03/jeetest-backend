-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MCQ', 'INTEGER');

-- CreateEnum
CREATE TYPE "AnswerStatus" AS ENUM ('NOT_VISITED', 'NOT_ANSWERED', 'ANSWERED', 'MARKED_FOR_REVIEW');

-- CreateTable
CREATE TABLE "tests" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "totalMarks" INTEGER NOT NULL DEFAULT 0,
    "isLive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sections" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "questionType" "QuestionType" NOT NULL,
    "isIntegerType" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,
    "testId" TEXT NOT NULL,

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "questionNumber" INTEGER NOT NULL,
    "questionImage" TEXT,
    "solutionImage" TEXT,
    "correctOption" TEXT,
    "correctInteger" INTEGER,
    "marks" INTEGER NOT NULL DEFAULT 4,
    "negativeMarks" INTEGER NOT NULL DEFAULT -1,
    "sectionId" TEXT NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_attempts" (
    "id" TEXT NOT NULL,
    "candidateName" TEXT NOT NULL,
    "candidateImage" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "totalMarks" INTEGER NOT NULL DEFAULT 0,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "testId" TEXT NOT NULL,

    CONSTRAINT "test_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answers" (
    "id" TEXT NOT NULL,
    "selectedOption" TEXT,
    "integerAnswer" INTEGER,
    "status" "AnswerStatus" NOT NULL DEFAULT 'NOT_VISITED',
    "isCorrect" BOOLEAN,
    "marksAwarded" INTEGER NOT NULL DEFAULT 0,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,

    CONSTRAINT "answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "answers_attemptId_questionId_key" ON "answers"("attemptId", "questionId");

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_testId_fkey" FOREIGN KEY ("testId") REFERENCES "tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_attempts" ADD CONSTRAINT "test_attempts_testId_fkey" FOREIGN KEY ("testId") REFERENCES "tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "test_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
