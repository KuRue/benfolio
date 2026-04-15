-- CreateEnum
CREATE TYPE "PhotoOrderMode" AS ENUM ('AUTO', 'MANUAL');

-- AlterTable
ALTER TABLE "SiteProfile"
ADD COLUMN "handle" TEXT;

-- AlterTable
ALTER TABLE "Event"
ADD COLUMN "photoOrderMode" "PhotoOrderMode" NOT NULL DEFAULT 'AUTO';

-- AlterTable
ALTER TABLE "Photo"
ADD COLUMN "altText" TEXT,
ADD COLUMN "takenAtOverride" TIMESTAMP(3);
