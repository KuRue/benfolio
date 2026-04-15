-- AlterTable
ALTER TABLE "Photo"
ADD COLUMN "contentHashSha256" VARCHAR(64);

-- AlterTable
ALTER TABLE "ImportItem"
ADD COLUMN "sourceProvider" TEXT,
ADD COLUMN "sourceEtag" TEXT,
ADD COLUMN "sourceVersion" TEXT,
ADD COLUMN "contentHashSha256" VARCHAR(64),
ADD COLUMN "dismissedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ImportItemEvent" (
    "id" TEXT NOT NULL,
    "importItemId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "detail" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportItemEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Photo_contentHashSha256_idx" ON "Photo"("contentHashSha256");

-- CreateIndex
CREATE INDEX "ImportItem_dismissedAt_idx" ON "ImportItem"("dismissedAt");

-- CreateIndex
CREATE INDEX "ImportItem_contentHashSha256_idx" ON "ImportItem"("contentHashSha256");

-- CreateIndex
CREATE INDEX "ImportItemEvent_importItemId_createdAt_idx" ON "ImportItemEvent"("importItemId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportItemEvent_eventType_createdAt_idx" ON "ImportItemEvent"("eventType", "createdAt");

-- AddForeignKey
ALTER TABLE "ImportItemEvent" ADD CONSTRAINT "ImportItemEvent_importItemId_fkey" FOREIGN KEY ("importItemId") REFERENCES "ImportItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
