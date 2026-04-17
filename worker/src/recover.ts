/**
 * Disaster recovery: reconstruct Event + Photo rows by scanning the R2
 * originals bucket.
 *
 * The app stores originals under a well-defined key layout:
 *   events/{eventId}/photos/{photoId}/original.{ext}
 *
 * If the Postgres metadata gets wiped but R2 is intact, we can pull the
 * event/photo IDs back out of those keys and create placeholder rows. The
 * worker's normal processing pipeline (re-queued here) then regenerates
 * derivatives and repopulates EXIF/dimensions/content-hash from each
 * original, so the public site mostly recovers on its own.
 *
 * What this DOES restore:
 *   - Event rows (one per eventId prefix, placeholder title/slug, DRAFT)
 *   - Photo rows with correct IDs + original keys
 *   - Derivatives (queued for worker regeneration)
 *   - EXIF / dimensions / dominant color / blur placeholders (via worker)
 *
 * What this CANNOT restore:
 *   - Event titles, descriptions, dates, locations — placeholders only
 *   - Tags and tag aliases
 *   - Photo captions / alt text / sort order overrides
 *   - Site profile copy, admin users, settings (these come from seed/env)
 *
 * Run:
 *   docker compose run --rm worker node worker/dist/worker/src/recover.js
 *   # add --force to run even when the DB already has events/photos
 *
 * Safe by default: refuses to touch a populated DB without --force, so you
 * can leave this callable in production without worrying about accidents.
 */

import { Queue } from "bullmq";
import { Redis } from "ioredis";

import { env } from "./env.js";
import { inferPhotoMimeType } from "./photo-files.js";
import { prisma } from "./prisma.js";
import { getStorageBuckets, listObjects } from "./storage.js";

const PHOTO_PROCESSING_QUEUE = "photo-processing";
const ORIGINAL_KEY_PATTERN =
  /^events\/([^/]+)\/photos\/([^/]+)\/(original\.[^/]+)$/;

type RecoveredObject = {
  eventId: string;
  photoId: string;
  originalKey: string;
  originalFilename: string;
  originalByteSize: bigint;
  originalMimeType: string;
  lastModified: Date | null;
};

async function scanOriginals(bucket: string) {
  const results: RecoveredObject[] = [];
  const skipped: string[] = [];

  const objects = await listObjects({ bucket, prefix: "events/" });

  for (const object of objects) {
    const match = ORIGINAL_KEY_PATTERN.exec(object.key);
    if (!match) {
      skipped.push(object.key);
      continue;
    }

    const [, eventId, photoId, filename] = match;
    results.push({
      eventId,
      photoId,
      originalKey: object.key,
      originalFilename: filename,
      originalByteSize: BigInt(object.size),
      originalMimeType: inferPhotoMimeType(filename, null),
      lastModified: object.lastModified,
    });
  }

  return { results, skipped };
}

async function main() {
  const force = process.argv.includes("--force");
  const dryRun = process.argv.includes("--dry-run");

  const [eventCount, photoCount] = await Promise.all([
    prisma.event.count(),
    prisma.photo.count(),
  ]);

  if (!force && (eventCount > 0 || photoCount > 0)) {
    console.log(
      `[recover] Database already populated (events=${eventCount}, photos=${photoCount}). ` +
        `Refusing to run without --force.`,
    );
    return;
  }

  const buckets = await getStorageBuckets();
  if (!buckets.originals) {
    throw new Error("[recover] Originals bucket is not configured");
  }

  console.log(
    `[recover] Scanning bucket=${buckets.originals} prefix=events/ ...`,
  );
  const { results, skipped } = await scanOriginals(buckets.originals);
  console.log(
    `[recover] Found ${results.length} recoverable originals` +
      (skipped.length ? ` (${skipped.length} keys skipped — non-matching layout)` : ""),
  );

  if (results.length === 0) {
    console.log("[recover] Nothing to recover.");
    return;
  }

  // Group by eventId so we can pick the earliest lastModified as eventDate.
  const byEvent = new Map<string, RecoveredObject[]>();
  for (const obj of results) {
    const bucket = byEvent.get(obj.eventId);
    if (bucket) {
      bucket.push(obj);
    } else {
      byEvent.set(obj.eventId, [obj]);
    }
  }

  console.log(
    `[recover] Reconstructing ${byEvent.size} event(s), ${results.length} photo(s).`,
  );

  if (dryRun) {
    for (const [eventId, photos] of byEvent) {
      console.log(`  event ${eventId} → ${photos.length} photo(s)`);
    }
    console.log("[recover] --dry-run: no writes performed.");
    return;
  }

  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const photoQueue = new Queue<{ photoId: string }>(PHOTO_PROCESSING_QUEUE, {
    connection,
  });

  let eventsCreated = 0;
  let eventsSkipped = 0;
  let photosCreated = 0;
  let photosSkipped = 0;
  let photosQueued = 0;

  try {
    for (const [eventId, photos] of byEvent) {
      const earliest = photos.reduce<Date | null>((acc, p) => {
        if (!p.lastModified) return acc;
        if (!acc || p.lastModified < acc) return p.lastModified;
        return acc;
      }, null);

      const shortId = eventId.slice(-8).toLowerCase();
      const eventDate = earliest ?? new Date();

      const existingEvent = await prisma.event.findUnique({
        where: { id: eventId },
        select: { id: true },
      });

      if (existingEvent) {
        eventsSkipped += 1;
      } else {
        // Slug must be unique. Collisions are vanishingly unlikely since
        // the cuid suffix is 8 chars of 36-char alphabet, but fall back
        // to the full id if we somehow hit one.
        let slug = `recovered-${shortId}`;
        const slugCollision = await prisma.event.findUnique({
          where: { slug },
          select: { id: true },
        });
        if (slugCollision) {
          slug = `recovered-${eventId.toLowerCase()}`;
        }

        await prisma.event.create({
          data: {
            id: eventId,
            title: `Recovered event ${shortId}`,
            slug,
            eventDate,
            visibility: "DRAFT",
            description:
              "Auto-recovered from storage. Edit the title, slug, date, " +
              "and visibility, then publish.",
          },
        });
        eventsCreated += 1;
      }

      for (const photo of photos) {
        const existingPhoto = await prisma.photo.findUnique({
          where: { id: photo.photoId },
          select: { id: true },
        });
        if (existingPhoto) {
          photosSkipped += 1;
          continue;
        }

        await prisma.photo.create({
          data: {
            id: photo.photoId,
            eventId,
            originalKey: photo.originalKey,
            originalFilename: photo.originalFilename,
            originalMimeType: photo.originalMimeType,
            originalByteSize: photo.originalByteSize,
            processingState: "UPLOADED",
          },
        });
        photosCreated += 1;

        await photoQueue.add(
          "photo.process",
          { photoId: photo.photoId },
          { jobId: photo.photoId },
        );
        photosQueued += 1;
      }
    }
  } finally {
    await photoQueue.close();
    connection.disconnect();
  }

  console.log(
    `[recover] Done. ` +
      `events: ${eventsCreated} created, ${eventsSkipped} already existed. ` +
      `photos: ${photosCreated} created, ${photosSkipped} already existed, ` +
      `${photosQueued} queued for derivative regeneration.`,
  );
  console.log(
    "[recover] Next: open /admin/events and rename/redate the recovered events, " +
      "then switch visibility from DRAFT to PUBLIC.",
  );
}

main()
  .catch((error) => {
    console.error("[recover] Failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
