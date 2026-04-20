-- PhotoView: per-(photo, visitor, day) deduped view record
CREATE TABLE "PhotoView" (
    "photoId" VARCHAR(12) NOT NULL,
    "visitorId" VARCHAR(64) NOT NULL,
    "day" DATE NOT NULL,
    "firstViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhotoView_pkey" PRIMARY KEY ("photoId", "visitorId", "day")
);

CREATE INDEX "PhotoView_photoId_idx" ON "PhotoView"("photoId");
CREATE INDEX "PhotoView_day_idx" ON "PhotoView"("day");

ALTER TABLE "PhotoView"
    ADD CONSTRAINT "PhotoView_photoId_fkey"
    FOREIGN KEY ("photoId") REFERENCES "Photo"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- SiteVisitorDay: per-(visitor, day) deduped site visit record
CREATE TABLE "SiteVisitorDay" (
    "visitorId" VARCHAR(64) NOT NULL,
    "day" DATE NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteVisitorDay_pkey" PRIMARY KEY ("visitorId", "day")
);

CREATE INDEX "SiteVisitorDay_day_idx" ON "SiteVisitorDay"("day");
