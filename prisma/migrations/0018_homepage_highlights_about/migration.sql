ALTER TABLE "SiteProfile" ADD COLUMN "aboutBio" TEXT;

ALTER TABLE "Photo" ADD COLUMN "isHighlight" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Photo_eventId_isHighlight_idx" ON "Photo"("eventId", "isHighlight");
CREATE INDEX "Photo_isHighlight_processingState_idx" ON "Photo"("isHighlight", "processingState");
