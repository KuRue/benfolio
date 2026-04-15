CREATE TYPE "TagCategory" AS ENUM ('CHARACTER', 'EVENT', 'SPECIES', 'MAKER', 'GENERAL');

ALTER TABLE "Tag"
ADD COLUMN "category" "TagCategory" NOT NULL DEFAULT 'GENERAL';

ALTER TABLE "Tag"
DROP CONSTRAINT "Tag_slug_key";

ALTER TABLE "Tag"
DROP CONSTRAINT "Tag_name_key";

CREATE UNIQUE INDEX "Tag_category_slug_key" ON "Tag"("category", "slug");
CREATE INDEX "Tag_category_name_idx" ON "Tag"("category", "name");
CREATE INDEX "Tag_slug_idx" ON "Tag"("slug");
