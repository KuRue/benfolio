import "server-only";

import { ImageResponse } from "next/og";

import { getSiteProfile } from "@/lib/gallery";
import { prisma } from "@/lib/prisma";
import { getStorageBuckets, readObject } from "@/lib/storage";

export const HOMEPAGE_OG_ALT = "Recent event photography";
export const HOMEPAGE_OG_SIZE = { width: 1200, height: 630 };
export const HOMEPAGE_OG_CONTENT_TYPE = "image/png";

const TILE_CELLS = 4; // 2 × 2 grid

async function readDerivativeAsDataUrl(key: string): Promise<string | null> {
  try {
    const buckets = await getStorageBuckets();
    const { body, contentType } = await readObject({
      bucket: buckets.derivatives,
      key,
    });
    return `data:${contentType};base64,${body.toString("base64")}`;
  } catch (error) {
    console.error("[og-image] failed to read derivative", { key, error });
    return null;
  }
}

async function collectTileSources(): Promise<string[]> {
  const events = await prisma.event.findMany({
    where: {
      visibility: "PUBLIC",
      coverDisplayKey: { not: null },
    },
    orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }],
    take: TILE_CELLS,
    select: { coverDisplayKey: true },
  });

  const keys = events
    .map((event) => event.coverDisplayKey)
    .filter((key): key is string => Boolean(key));

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
