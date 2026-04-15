import "server-only";

import { Queue } from "bullmq";
import IORedis from "ioredis";

import { env } from "@/lib/env";

export const PHOTO_PROCESSING_QUEUE = "photo-processing";
export const IMPORT_PROCESSING_QUEUE = "import-processing";

export type PhotoProcessingJob = {
  photoId: string;
};

export type ImportProcessingJob = {
  importJobId: string;
};

const globalForQueue = globalThis as typeof globalThis & {
  __galleryRedis?: IORedis;
  __galleryPhotoQueue?: Queue<PhotoProcessingJob>;
  __galleryImportQueue?: Queue<ImportProcessingJob>;
};

function getRedisConnection() {
  return (
    globalForQueue.__galleryRedis ??
    new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
    })
  );
}

export function getPhotoQueue() {
  if (!globalForQueue.__galleryPhotoQueue) {
    globalForQueue.__galleryRedis = getRedisConnection();
    globalForQueue.__galleryPhotoQueue = new Queue<PhotoProcessingJob>(
      PHOTO_PROCESSING_QUEUE,
      {
        connection: globalForQueue.__galleryRedis,
        defaultJobOptions: {
          attempts: 3,
          removeOnComplete: 1000,
          removeOnFail: 1000,
        },
      },
    );
  }

  return globalForQueue.__galleryPhotoQueue;
}

export function getImportQueue() {
  if (!globalForQueue.__galleryImportQueue) {
    globalForQueue.__galleryRedis = getRedisConnection();
    globalForQueue.__galleryImportQueue = new Queue<ImportProcessingJob>(
      IMPORT_PROCESSING_QUEUE,
      {
        connection: globalForQueue.__galleryRedis,
        defaultJobOptions: {
          attempts: 3,
          removeOnComplete: 1000,
          removeOnFail: 1000,
        },
      },
    );
  }

  return globalForQueue.__galleryImportQueue;
}

export async function enqueuePhotoProcessing(photoId: string) {
  await getPhotoQueue().add("photo.process", { photoId }, { jobId: photoId });
}

export async function enqueueImportProcessing(importJobId: string) {
  await getImportQueue().add(
    "import.process",
    { importJobId },
    { jobId: importJobId },
  );
}
