-- CreateEnum
CREATE TYPE "ImportItemStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETE', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ImportCleanupStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'DELETED', 'ARCHIVED', 'FAILED');

-- CreateTable
CREATE TABLE "ImportItem" (
    "id" TEXT NOT NULL,
    "importJobId" TEXT NOT NULL,
    "source" "ExternalAssetSource" NOT NULL DEFAULT 'STORAGE_IMPORT',
    "sourceKey" TEXT NOT NULL,
    "sourceFilename" TEXT NOT NULL,
    "sourceByteSize" BIGINT,
    "sourceLastModified" TIMESTAMP(3),
    "eventSlug" TEXT NOT NULL,
    "eventId" TEXT,
    "photoId" TEXT,
    "status" "ImportItemStatus" NOT NULL DEFAULT 'PENDING',
    "cleanupMode" TEXT,
    "cleanupStatus" "ImportCleanupStatus" NOT NULL DEFAULT 'PENDING',
    "cleanupTargetKey" TEXT,
    "cleanupError" TEXT,
    "skipReason" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportItem_status_createdAt_idx" ON "ImportItem"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ImportItem_source_sourceKey_idx" ON "ImportItem"("source", "sourceKey");

-- CreateIndex
CREATE INDEX "ImportItem_eventSlug_idx" ON "ImportItem"("eventSlug");

-- CreateIndex
CREATE INDEX "ImportItem_eventId_idx" ON "ImportItem"("eventId");

-- CreateIndex
CREATE INDEX "ImportItem_photoId_idx" ON "ImportItem"("photoId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportItem_importJobId_sourceKey_key" ON "ImportItem"("importJobId", "sourceKey");

-- AddForeignKey
ALTER TABLE "ImportItem" ADD CONSTRAINT "ImportItem_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportItem" ADD CONSTRAINT "ImportItem_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportItem" ADD CONSTRAINT "ImportItem_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
