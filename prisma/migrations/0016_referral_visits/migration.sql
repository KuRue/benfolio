-- ReferralVisit: per-(visitor, day, referrer) deduped referral record.
-- Populated in trackSiteVisit() whenever a request's Referer header points
-- to a different origin than our own APP_URL.
CREATE TABLE "ReferralVisit" (
    "visitorId" VARCHAR(64) NOT NULL,
    "day" DATE NOT NULL,
    "referrerHost" VARCHAR(253) NOT NULL,
    "landingPath" VARCHAR(512) NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralVisit_pkey" PRIMARY KEY ("visitorId", "day", "referrerHost")
);

CREATE INDEX "ReferralVisit_day_referrerHost_idx"
    ON "ReferralVisit"("day", "referrerHost");

CREATE INDEX "ReferralVisit_referrerHost_idx"
    ON "ReferralVisit"("referrerHost");
