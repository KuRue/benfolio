CREATE TABLE IF NOT EXISTS "FurtrackMatchDismissal" (
    "photoId" TEXT NOT NULL,
    "externalPostId" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FurtrackMatchDismissal_pkey" PRIMARY KEY ("photoId", "externalPostId")
);

CREATE INDEX IF NOT EXISTS "FurtrackMatchDismissal_externalPostId_idx" ON "FurtrackMatchDismissal"("externalPostId");

ALTER TABLE "FurtrackMatchDismissal"
    ADD CONSTRAINT "FurtrackMatchDismissal_photoId_fkey"
    FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
