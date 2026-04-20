import "server-only";

import { ImageResponse } from "next/og";
import sharp from "sharp";

import { getSiteProfile } from "@/lib/gallery";
import { prisma } from "@/lib/prisma";
import { getStorageBuckets, readObject } from "@/lib/storage";

export const HOMEPAGE_OG_ALT = "Recent event photography";
export const HOMEPAGE_OG_SIZE = { width: 1200, height: 630 };
export const HOMEPAGE_OG_CONTENT_TYPE = "image/png";

const TILE_CELLS = 4; // 2 × 2 grid
const TILE_WIDTH = HOMEPAGE_OG_SIZE.width / 2;
const TILE_HEIGHT = HOMEPAGE_OG_SIZE.height / 2;

// Rank by how well the derivative matches our ~600px tile render size.
// GRID (960px) is the sweet spot; THUMBNAIL (320px) is a touch soft but
// ships fast; VIEWER (1800px) is a last resort because it can push the
// whole OG route past Cloudflare's edge timeout when we embed four of
// them as base64 into satori.
const KIND_PRIORITY: Record<string, number> = {
  GRID: 0,
  THUMBNAIL: 1,
  VIEWER: 2,
};

type TileSource = {
  key: string;
  // Focal point as percentages 0-100 (center = 50), matching the CSS
  // object-position semantics used on /e/[slug] and EventCard.
  focalX: number;
  focalY: number;
};

/**
 * Focal-aware crop + JPEG transcode. Satori/@vercel/og advertises WebP
 * support in its accept list but trips on actual decoding (manifested as
 * a fast 502 mid-stream), and its objectFit/objectPosition handling is
 * limited — so we do the cropping in sharp instead and hand satori a
 * pre-sized JPEG tile.
 */
async function readDerivativeAsTileJpeg(
  src: TileSource,
  target: { width: number; height: number },
): Promise<string | null> {
  try {
    const buckets = await getStorageBuckets();
    const { body } = await readObject({
      bucket: buckets.derivatives,
      key: src.key,
    });

    const meta = await sharp(body).metadata();
    const sourceWidth = meta.width ?? 0;
    const sourceHeight = meta.height ?? 0;

    // If we don't have dimensions for some reason, fall back to a plain
    // cover-fit resize with centered gravity.
    if (!sourceWidth || !sourceHeight) {
      const jpeg = await sharp(body)
        .resize({
          width: target.width,
          height: target.height,
          fit: "cover",
          position: "centre",
        })
        .jpeg({ quality: 80, mozjpeg: true })
        .toBuffer();
      return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
    }

    // Compute a focal-point-aware extract box: find the largest rect of
    // the target aspect ratio that fits inside the source, then slide it
    // toward (focalX, focalY). This mirrors what browsers do for
    // `object-fit: cover; object-position: X% Y%`.
    const targetAspect = target.width / target.height;
    const sourceAspect = sourceWidth / sourceHeight;

    let cropW: number;
    let cropH: number;
    if (sourceAspect > targetAspect) {
      cropH = sourceHeight;
      cropW = Math.round(sourceHeight * targetAspect);
    } else {
      cropW = sourceWidth;
      cropH = Math.round(sourceWidth / targetAspect);
    }

    const maxOffsetX = Math.max(0, sourceWidth - cropW);
    const maxOffsetY = Math.max(0, sourceHeight - cropH);
    const focalX = Math.min(100, Math.max(0, src.focalX)) / 100;
    const focalY = Math.min(100, Math.max(0, src.focalY)) / 100;
    const left = Math.round(maxOffsetX * focalX);
    const top = Math.round(maxOffsetY * focalY);

    const jpeg = await sharp(body)
      .extract({
        left,
        top,
        width: Math.min(cropW, sourceWidth - left),
        height: Math.min(cropH, sourceHeight - top),
      })
      .resize({ width: target.width, height: target.height })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();

    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch (error) {
    console.error("[og-image] failed to read derivative", {
      key: src.key,
      error,
    });
    return null;
  }
}

async function collectTileSources(): Promise<TileSource[]> {
  const events = await prisma.event.findMany({
    where: {
      visibility: "PUBLIC",
      coverOriginalKey: { not: null },
    },
    orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }],
    take: TILE_CELLS,
    select: {
      coverOriginalKey: true,
      coverDisplayKey: true,
      coverFocalX: true,
      coverFocalY: true,
    },
  });

  const originalKeys = events
    .map((event) => event.coverOriginalKey)
    .filter((key): key is string => Boolean(key));

  // Pull smaller derivatives (GRID/THUMBNAIL) for the cover photos so the
  // OG render stays fast.
  const coverPhotos = originalKeys.length
    ? await prisma.photo.findMany({
        where: { originalKey: { in: originalKeys } },
        select: {
          originalKey: true,
          derivatives: {
            select: { kind: true, storageKey: true },
          },
        },
      })
    : [];

  const byOriginal = new Map<string, string>();
  for (const photo of coverPhotos) {
    const best = [...photo.derivatives].sort(
      (a, b) =>
        (KIND_PRIORITY[a.kind] ?? 99) - (KIND_PRIORITY[b.kind] ?? 99),
    )[0];
    if (best?.storageKey) {
      byOriginal.set(photo.originalKey, best.storageKey);
    }
  }

  // Preserve event ordering; fall back to the event's coverDisplayKey
  // (VIEWER) if the photo row has no derivatives for some reason.
  const sources: TileSource[] = [];
  for (const event of events) {
    const original = event.coverOriginalKey;
    if (!original) continue;
    const smaller = byOriginal.get(original);
    const key = smaller ?? event.coverDisplayKey;
    if (!key) continue;
    sources.push({
      key,
      focalX: event.coverFocalX ?? 50,
      focalY: event.coverFocalY ?? 50,
    });
  }

  // Fall back to the SiteProfile cover when there are no public events yet.
  if (!sources.length) {
    try {
      const profile = await getSiteProfile();
      if (profile.coverDisplayKey) {
        sources.push({
          key: profile.coverDisplayKey,
          focalX: profile.coverFocalX ?? 50,
          focalY: profile.coverFocalY ?? 50,
        });
      }
    } catch {
      // Database unavailable — ship the blank fallback.
    }
  }

  return sources;
}

/**
 * Generate the homepage share card as a 1200×630 PNG. Pulls the most recent
 * public event covers and arranges them in a 2×2 grid. Falls back to a
 * full-bleed SiteProfile cover when there aren't enough public events, or a
 * blank dark card when nothing is available.
 *
 * PNG output is deliberate — X's WebP handling is inconsistent; PNG renders
 * reliably across X, Discord, Slack, and iMessage.
 */
export async function generateHomepageOgImage(): Promise<ImageResponse> {
  const tileSources = await collectTileSources();
  const background = "#050505";

  if (!tileSources.length) {
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            background,
          }}
        />
      ),
      { ...HOMEPAGE_OG_SIZE },
    );
  }

  if (tileSources.length === 1) {
    const fullBleed = await readDerivativeAsTileJpeg(
      tileSources[0]!,
      HOMEPAGE_OG_SIZE,
    );
    if (!fullBleed) {
      return new ImageResponse(
        (
          <div
            style={{
              display: "flex",
              width: "100%",
              height: "100%",
              background,
            }}
          />
        ),
        { ...HOMEPAGE_OG_SIZE },
      );
    }
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            background,
          }}
        >
          <img
            src={fullBleed}
            width={HOMEPAGE_OG_SIZE.width}
            height={HOMEPAGE_OG_SIZE.height}
          />
        </div>
      ),
      { ...HOMEPAGE_OG_SIZE },
    );
  }

  // 2+ sources → fill the 2×2 grid, cycling when there are fewer than 4.
  const tileSlots = Array.from({ length: TILE_CELLS }).map(
    (_, index) => tileSources[index % tileSources.length]!,
  );

  const tiles = await Promise.all(
    tileSlots.map((src) =>
      readDerivativeAsTileJpeg(src, {
        width: TILE_WIDTH,
        height: TILE_HEIGHT,
      }),
    ),
  );

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          width: "100%",
          height: "100%",
          background,
        }}
      >
        {tiles.map((src, index) => (
          <div
            key={index}
            style={{
              display: "flex",
              width: TILE_WIDTH,
              height: TILE_HEIGHT,
              overflow: "hidden",
            }}
          >
            {src ? (
              <img src={src} width={TILE_WIDTH} height={TILE_HEIGHT} />
            ) : null}
          </div>
        ))}
      </div>
    ),
    { ...HOMEPAGE_OG_SIZE },
  );
}
