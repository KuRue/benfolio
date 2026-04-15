import { createHash } from "node:crypto";

import { Queue, Worker } from "bullmq";
import exifr from "exifr";
import { Redis } from "ioredis";
import sharp from "sharp";

import { Prisma } from "../../prisma/generated/client/client.ts";
import { env } from "./env.js";
import {
  handleImportedPhotoFailed,
  handleImportedPhotoReady,
  processImportJob,
} from "./imports.js";
import { prisma } from "./prisma.js";
import { readObject, storageBuckets, uploadObject } from "./storage.js";

const PHOTO_PROCESSING_QUEUE = "photo-processing";
const IMPORT_PROCESSING_QUEUE = "import-processing";

type PhotoProcessingJob = {
  photoId: string;
};

type ImportProcessingJob = {
  importJobId: string;
};

const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

const photoQueue = new Queue<PhotoProcessingJob>(PHOTO_PROCESSING_QUEUE, {
  connection,
});

function formatFocalLength(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  return `${Math.round(value)}mm`;
}

function formatAperture(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  return `f/${value.toFixed(1)}`;
}

function formatShutterSpeed(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  if (value >= 1) {
    return `${value.toFixed(1)}s`;
  }

  return `1/${Math.round(1 / value)}`;
}

function makeSerializable(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => makeSerializable(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, makeSerializable(entry)]),
    );
  }

  return value;
}

async function buildBlurDataUrl(image: sharp.Sharp) {
  const blurBuffer = await image
    .clone()
    .resize({ width: 24, withoutEnlargement: true })
    .jpeg({ quality: 45 })
    .toBuffer();

  return `data:image/jpeg;base64,${blurBuffer.toString("base64")}`;
}

async function getDominantColor(image: sharp.Sharp) {
  const { data } = await image
    .clone()
    .resize(1, 1)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const [red, green, blue] = data;
  return `#${[red, green, blue]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

async function normalizeEventSortOrder(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      photoOrderMode: true,
    },
  });

  if (!event) {
    return;
  }

  const photos = await prisma.photo.findMany({
    where: { eventId },
    select: {
      id: true,
      sortOrder: true,
      takenAtOverride: true,
      capturedAt: true,
      createdAt: true,
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const ordered =
    event.photoOrderMode === "MANUAL"
      ? photos
      : [...photos].sort((left, right) => {
          const leftTime =
            left.takenAtOverride?.getTime() ??
            left.capturedAt?.getTime() ??
            left.createdAt.getTime();
          const rightTime =
            right.takenAtOverride?.getTime() ??
            right.capturedAt?.getTime() ??
            right.createdAt.getTime();

          if (leftTime !== rightTime) {
            return leftTime - rightTime;
          }

          if (left.createdAt.getTime() !== right.createdAt.getTime()) {
            return left.createdAt.getTime() - right.createdAt.getTime();
          }

          if (left.sortOrder !== right.sortOrder) {
            return left.sortOrder - right.sortOrder;
          }

          return left.id.localeCompare(right.id);
        });

  await prisma.$transaction(
    ordered.map((photo, index) =>
      prisma.photo.update({
        where: { id: photo.id },
        data: { sortOrder: index },
      }),
    ),
  );
}

async function processPhoto(photoId: string) {
  const photo = await prisma.photo.findUnique({
    where: { id: photoId },
    include: {
      event: true,
    },
  });

  if (!photo) {
    throw new Error(`Photo ${photoId} not found`);
  }

  await prisma.photo.update({
    where: { id: photoId },
    data: {
      processingState: "PROCESSING",
      errorMessage: null,
    },
  });

  const originalBuffer = await readObject(storageBuckets.originals, photo.originalKey);
  const contentHashSha256 = createHash("sha256").update(originalBuffer).digest("hex");
  const image = sharp(originalBuffer).rotate();
  const metadata = await image.metadata();
  const exif = await exifr.parse(originalBuffer, {
    translateValues: false,
  });

  const blurDataUrl = await buildBlurDataUrl(image);
  const dominantColor = await getDominantColor(image);

  const derivatives = await Promise.all(
    [
      { kind: "THUMBNAIL" as const, width: 320, quality: 72 },
      { kind: "GRID" as const, width: 960, quality: 80 },
      { kind: "VIEWER" as const, width: 1800, quality: 86 },
    ].map(async (preset) => {
      const { data, info } = await image
        .clone()
        .resize({
          width: preset.width,
          withoutEnlargement: true,
        })
        .webp({ quality: preset.quality })
        .toBuffer({ resolveWithObject: true });

      const storageKey = `events/${photo.eventId}/photos/${photo.id}/${preset.kind.toLowerCase()}-${info.width}.webp`;

      await uploadObject({
        bucket: storageBuckets.derivatives,
        key: storageKey,
        body: data,
        contentType: "image/webp",
        cacheControl: "public, max-age=31536000, immutable",
      });

      return {
        kind: preset.kind,
        format: "WEBP" as const,
        width: info.width,
        height: info.height,
        byteSize: info.size,
        contentType: "image/webp",
        storageKey,
      };
    }),
  );

  const capturedAtRaw =
    exif?.DateTimeOriginal ?? exif?.CreateDate ?? exif?.ModifyDate ?? null;
  const capturedAt =
    capturedAtRaw instanceof Date && !Number.isNaN(capturedAtRaw.getTime())
      ? capturedAtRaw
      : null;

  const viewerDerivative = derivatives.find((derivative) => derivative.kind === "VIEWER");

  await prisma.$transaction([
    prisma.photoDerivative.deleteMany({
      where: { photoId },
    }),
    prisma.photo.update({
      where: { id: photoId },
      data: {
        width: metadata.width ?? null,
        height: metadata.height ?? null,
        orientation: metadata.orientation ?? null,
        blurDataUrl,
        dominantColor,
        capturedAt,
        cameraMake: typeof exif?.Make === "string" ? exif.Make : null,
        cameraModel: typeof exif?.Model === "string" ? exif.Model : null,
        lensModel: typeof exif?.LensModel === "string" ? exif.LensModel : null,
        focalLength: formatFocalLength(exif?.FocalLength),
        aperture: formatAperture(exif?.FNumber),
        shutterSpeed: formatShutterSpeed(exif?.ExposureTime),
        iso:
          typeof exif?.ISO === "number" && Number.isFinite(exif.ISO)
            ? Math.round(exif.ISO)
            : null,
        exifJson: exif
          ? (makeSerializable(exif) as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        processingState: "READY",
        processedAt: new Date(),
        contentHashSha256,
      },
    }),
    prisma.photoDerivative.createMany({
      data: derivatives.map((derivative) => ({
        photoId,
        ...derivative,
      })),
    }),
    prisma.event.updateMany({
      where: {
        id: photo.eventId,
        OR: [{ coverDisplayKey: null }, { coverOriginalKey: photo.originalKey }],
      },
      data: viewerDerivative
        ? {
            coverOriginalKey: photo.originalKey,
            coverDisplayKey: viewerDerivative.storageKey,
            coverWidth: viewerDerivative.width,
            coverHeight: viewerDerivative.height,
          }
        : {},
    }),
  ]);

  await normalizeEventSortOrder(photo.eventId);
  await handleImportedPhotoReady(photoId);
}

const worker = new Worker<PhotoProcessingJob>(
  PHOTO_PROCESSING_QUEUE,
  async (job) => {
    await processPhoto(job.data.photoId);
  },
  {
    connection,
    concurrency: 2,
  },
);

const importWorker = new Worker<ImportProcessingJob>(
  IMPORT_PROCESSING_QUEUE,
  async (job) => {
    await processImportJob(job.data.importJobId, async (photoId) => {
      await photoQueue.add("photo.process", { photoId }, { jobId: photoId });
    });
  },
  {
    connection,
    concurrency: 1,
  },
);

worker.on("completed", (job) => {
  console.log(`Processed photo ${job.data.photoId}`);
});

worker.on("failed", async (job, error) => {
  if (!job) {
    console.error(error);
    return;
  }

  await prisma.photo.updateMany({
    where: { id: job.data.photoId },
    data: {
      processingState: "FAILED",
      errorMessage: error.message,
    },
  });

  await handleImportedPhotoFailed(job.data.photoId, error.message);

  console.error(`Failed photo ${job.data.photoId}: ${error.message}`);
});

importWorker.on("completed", (job) => {
  console.log(`Processed import job ${job.data.importJobId}`);
});

importWorker.on("failed", async (job, error) => {
  if (!job) {
    console.error(error);
    return;
  }

  await prisma.importJob.updateMany({
    where: { id: job.data.importJobId },
    data: {
      status: "FAILED",
      errorMessage: error.message,
      finishedAt: new Date(),
    },
  });

  console.error(`Failed import job ${job.data.importJobId}: ${error.message}`);
});

process.on("SIGINT", async () => {
  await worker.close();
  await importWorker.close();
  await photoQueue.close();
  await prisma.$disconnect();
  await connection.quit();
  process.exit(0);
});

console.log("Photo worker listening on queue", PHOTO_PROCESSING_QUEUE);
console.log("Import worker listening on queue", IMPORT_PROCESSING_QUEUE);
