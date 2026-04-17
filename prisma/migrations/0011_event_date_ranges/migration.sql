ALTER TABLE "Event"
ADD COLUMN "eventEndDate" TIMESTAMP(3);

CREATE INDEX "Event_eventEndDate_idx" ON "Event"("eventEndDate");
