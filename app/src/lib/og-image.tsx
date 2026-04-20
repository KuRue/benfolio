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

// Tile cells render at ~600px wide in the final 1200×630 collage. Resize
// down to 1200px (just enough for 2× density on the full-bleed fallback)
// and transcode to JPEG — satori/@vercel/og advertises WebP support in
// its accept list but trips on actual decoding, which manifested as a
// fast 502 mid-stream. JPEG bytes are also smaller than WebP for this
// size, so we gain on payload as well.
async function readDerivativeAsDataUrl(key: string): Promise<string | null> {
  try {
    const buckets = await getStorageBuckets();
    const { body } = await readObject({
      bucket: buckets.derivatives,
      key,
    });
    const jpeg = await sharp(body)
      .resize({ width: 1200, withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch (error) {
    console.error("[og-image] failed to read derivative", { key, error });
    return null;
  }
}

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

async function collectTileSources(): Promise<string[]> {
  const events = await prisma.event.findMany({
    where: {
      visibility: "PUBLIC",
      coverOriginalKey: { not: null },
    },
    orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }],
    take: TILE_CELLS,
    select: { coverOriginalKey: true, coverDisplayKey: true },
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
  const keys: string[] = [];
  for (const event of events) {
    const original = event.coverOriginalKey;
    if (!original) continue;
    const smaller = byOriginal.get(original);
    if (smaller) {
      keys.push(smaller);
    } else if (event.coverDisplayKey) {
      keys.push(event.coverDisplayKey);
    }
  }

  // Fall back to the SiteProfile cover when there are no public events yet.
  if (!keys.length) {
    try {
      const profile = await getSiteProfile();
      if (profile.coverDisplayKey) {
        keys.push(profile.coverDisplayKey);
      }
    } catch {
      // Database unavailable — ship the blank fallback.
    }
  }

  const sources = await Promise.all(
    keys.map((key) => readDerivativeAsDataUrl(key)),
  );

  return sources.filter((src): src is string => Boolean(src));
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
  const sources = await collectTileSources();
  const background = "#050505";

  if (!sources.length) {
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

  if (sources.length === 1) {
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
            src={sources[0]!}
            width={HOMEPAGE_OG_SIZE.width}
            height={HOMEPAGE_OG_SIZE.height}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        </div>
      ),
      { ...HOMEPAGE_OG_SIZE },
    );
  }

  // 2+ sources → fill the 2×2 grid, cycling when there are fewer than 4.
  const tiles = Array.from({ length: TILE_CELLS }).map(
    (_, index) => sources[index % sources.length]!,
  );

  const tileWidth = HOMEPAGE_OG_SIZE.width / 2;
  const tileHeight = HOMEPAGE_OG_SIZE.height / 2;

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
              width: tileWidth,
              height: tileHeight,
              overflow: "hidden",
            }}
          >
            <img
              src={src}
              width={tileWidth}
              height={tileHeight}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          </div>
        ))}
      </div>
    ),
    { ...HOMEPAGE_OG_SIZE },
  );
}
