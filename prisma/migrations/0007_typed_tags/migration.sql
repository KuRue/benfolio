CREATE TYPE "TagCategory" AS ENUM ('CHARACTER', 'EVENT', 'SPECIES', 'MAKER', 'GENERAL');

ALTER TABLE "Tag"
ADD COLUMN "category" "TagCategory" NOT NULL DEFAULT 'GENERAL';

DROP INDEX IF EXISTS "Tag_slug_key";
DROP INDEX IF EXISTS "Tag_name_key";

CREATE UNIQUE INDEX "Tag_category_slug_key" ON "Tag"("category", "slug");
CREATE INDEX "Tag_category_name_idx" ON "Tag"("category", "name");
CREATE INDEX "Tag_slug_idx" ON "Tag"("slug");
