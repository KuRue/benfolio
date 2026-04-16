ALTER TABLE "Tag"
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "TagAlias" (
  "id" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "category" "TagCategory" NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TagAlias_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TagAlias_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TagAlias_category_slug_key" ON "TagAlias"("category", "slug");
CREATE INDEX "TagAlias_tagId_idx" ON "TagAlias"("tagId");
CREATE INDEX "TagAlias_category_name_idx" ON "TagAlias"("category", "name");
