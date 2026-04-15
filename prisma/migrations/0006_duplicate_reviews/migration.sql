-- CreateEnum
CREATE TYPE "DuplicateReviewScope" AS ENUM ('GLOBAL', 'EVENT');

-- CreateEnum
CREATE TYPE "DuplicateReviewDecision" AS ENUM ('KEEP_BOTH', 'DISMISSED');

-- CreateTable
CREATE TABLE "DuplicateReview" (
    "id" TEXT NOT NULL,
    "scope" "DuplicateReviewScope" NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "contentHashSha256" VARCHAR(64) NOT NULL,
    "decision" "DuplicateReviewDecision" NOT NULL,
    "eventId" TEXT,
    "photoCountSnapshot" INTEGER NOT NULL,
    "latestPhotoCreatedAtSnapshot" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DuplicateReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DuplicateReview_scopeKey_contentHashSha256_key" ON "DuplicateReview"("scopeKey", "contentHashSha256");

-- CreateIndex
CREATE INDEX "DuplicateReview_contentHashSha256_idx" ON "DuplicateReview"("contentHashSha256");

-- CreateIndex
CREATE INDEX "DuplicateReview_eventId_idx" ON "DuplicateReview"("eventId");

-- AddForeignKey
ALTER TABLE "DuplicateReview" ADD CONSTRAINT "DuplicateReview_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
