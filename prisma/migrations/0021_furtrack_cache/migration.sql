CREATE TYPE "FurtrackCacheStatus" AS ENUM ('PENDING', 'READY', 'FAILED', 'MISSING');

CREATE TABLE "FurtrackCachedPost" (
  "postId" TEXT NOT NULL,
  "submitUserId" TEXT,
  "metaFingerprint" TEXT,
  "metaFiletype" TEXT,
  "metaWidth" INTEGER,
  "metaHeight" INTEGER,
  "externalUrl" TEXT,
  "imageUrl" TEXT,
  "dHash" VARCHAR(16),
  "averageHash" VARCHAR(16),
  "syncStatus" "FurtrackCacheStatus" NOT NULL DEFAULT 'PENDING',
  "errorMessage" TEXT,
  "lastFetchedAt" TIMESTAMP(3),
  "lastFingerprintedAt" TIMESTAMP(3),
  "missingAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FurtrackCachedPost_pkey" PRIMARY KEY ("postId")
);

CREATE TABLE "FurtrackCachedTag" (
  "postId" TEXT NOT NULL,
  "category" "TagCategory" NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "rawValue" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FurtrackCachedTag_pkey" PRIMARY KEY ("postId", "category", "slug", "rawValue")
);

CREATE INDEX "FurtrackCachedPost_syncStatus_updatedAt_idx" ON "FurtrackCachedPost"("syncStatus", "updatedAt");
CREATE INDEX "FurtrackCachedPost_dHash_idx" ON "FurtrackCachedPost"("dHash");
CREATE INDEX "FurtrackCachedPost_lastFetchedAt_idx" ON "FurtrackCachedPost"("lastFetchedAt");
CREATE INDEX "FurtrackCachedTag_category_slug_idx" ON "FurtrackCachedTag"("category", "slug");
CREATE INDEX "FurtrackCachedTag_rawValue_idx" ON "FurtrackCachedTag"("rawValue");

ALTER TABLE "FurtrackCachedTag"
  ADD CONSTRAINT "FurtrackCachedTag_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "FurtrackCachedPost"("postId")
  ON DELETE CASCADE ON UPDATE CASCADE;
