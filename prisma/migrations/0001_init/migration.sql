-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "EventVisibility" AS ENUM ('DRAFT', 'HIDDEN', 'PUBLIC');

-- CreateEnum
CREATE TYPE "PhotoProcessingState" AS ENUM ('UPLOADED', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "PhotoDerivativeKind" AS ENUM ('THUMBNAIL', 'GRID', 'VIEWER', 'OG');

-- CreateEnum
CREATE TYPE "ImageFormat" AS ENUM ('JPEG', 'WEBP', 'AVIF', 'PNG');

-- CreateEnum
CREATE TYPE "ExternalAssetSource" AS ENUM ('MANUAL', 'FURTRACK');

-- CreateEnum
CREATE TYPE "ImportJobType" AS ENUM ('MANUAL_UPLOAD', 'FURTRACK_SYNC');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "SiteProfile" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "displayName" TEXT NOT NULL DEFAULT 'Your Studio',
    "headline" TEXT NOT NULL DEFAULT 'Event photography arranged with the feel of the original night.',
    "bio" TEXT NOT NULL DEFAULT 'A mobile-first archive for event coverage, client galleries, and private releases.',
    "location" TEXT,
    "contactEmail" TEXT,
    "websiteUrl" TEXT,
    "instagramUrl" TEXT,
    "avatarOriginalKey" TEXT,
    "avatarDisplayKey" TEXT,
    "coverOriginalKey" TEXT,
    "coverDisplayKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "description" TEXT,
    "visibility" "EventVisibility" NOT NULL DEFAULT 'DRAFT',
    "coverOriginalKey" TEXT,
    "coverDisplayKey" TEXT,
    "coverWidth" INTEGER,
    "coverHeight" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" VARCHAR(12) NOT NULL,
    "eventId" TEXT NOT NULL,
    "originalKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "originalMimeType" TEXT NOT NULL,
    "originalByteSize" BIGINT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "processingState" "PhotoProcessingState" NOT NULL DEFAULT 'UPLOADED',
    "title" TEXT,
    "caption" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "orientation" INTEGER,
    "dominantColor" TEXT,
    "blurDataUrl" TEXT,
    "capturedAt" TIMESTAMP(3),
    "cameraMake" TEXT,
    "cameraModel" TEXT,
    "lensModel" TEXT,
    "focalLength" TEXT,
    "aperture" TEXT,
    "shutterSpeed" TEXT,
    "iso" INTEGER,
    "exifJson" JSONB,
    "errorMessage" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhotoDerivative" (
    "id" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "kind" "PhotoDerivativeKind" NOT NULL,
    "format" "ImageFormat" NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "byteSize" INTEGER,
    "contentType" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhotoDerivative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhotoTag" (
    "photoId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhotoTag_pkey" PRIMARY KEY ("photoId","tagId")
);

-- CreateTable
CREATE TABLE "ExternalAssetLink" (
    "id" TEXT NOT NULL,
    "source" "ExternalAssetSource" NOT NULL,
    "assetType" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "externalUrl" TEXT,
    "metadataJson" JSONB,
    "eventId" TEXT,
    "photoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalAssetLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "type" "ImportJobType" NOT NULL,
    "source" "ExternalAssetSource" NOT NULL DEFAULT 'MANUAL',
    "status" "ImportJobStatus" NOT NULL DEFAULT 'PENDING',
    "eventId" TEXT,
    "requestedById" TEXT,
    "payloadJson" JSONB,
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "processedItems" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");

-- CreateIndex
CREATE INDEX "Event_eventDate_idx" ON "Event"("eventDate");

-- CreateIndex
CREATE INDEX "Event_visibility_eventDate_idx" ON "Event"("visibility", "eventDate");

-- CreateIndex
CREATE INDEX "Photo_eventId_sortOrder_idx" ON "Photo"("eventId", "sortOrder");

-- CreateIndex
CREATE INDEX "Photo_eventId_capturedAt_idx" ON "Photo"("eventId", "capturedAt");

-- CreateIndex
CREATE INDEX "Photo_processingState_idx" ON "Photo"("processingState");

-- CreateIndex
CREATE INDEX "PhotoDerivative_photoId_kind_idx" ON "PhotoDerivative"("photoId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "PhotoDerivative_photoId_kind_format_width_key" ON "PhotoDerivative"("photoId", "kind", "format", "width");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE INDEX "ExternalAssetLink_eventId_idx" ON "ExternalAssetLink"("eventId");

-- CreateIndex
CREATE INDEX "ExternalAssetLink_photoId_idx" ON "ExternalAssetLink"("photoId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalAssetLink_source_externalId_assetType_key" ON "ExternalAssetLink"("source", "externalId", "assetType");

-- CreateIndex
CREATE INDEX "ImportJob_status_createdAt_idx" ON "ImportJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ImportJob_eventId_idx" ON "ImportJob"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoDerivative" ADD CONSTRAINT "PhotoDerivative_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoTag" ADD CONSTRAINT "PhotoTag_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoTag" ADD CONSTRAINT "PhotoTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalAssetLink" ADD CONSTRAINT "ExternalAssetLink_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalAssetLink" ADD CONSTRAINT "ExternalAssetLink_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
