import "server-only";

import { cookies } from "next/headers";

import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const VISITOR_COOKIE = "bf_vid";

/**
 * Read the visitor id issued by `proxy.ts`, or null if the request looks
 * like a bot / pre-cookie request. Tracking helpers no-op on null so
 * callers never have to branch.
 */
async function readVisitorId(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(VISITOR_COOKIE)?.value;
  if (!raw) return null;
  // Defensive: cap at column width. The proxy only ever writes 32 chars.
  return raw.slice(0, 64);
}

function today(): Date {
  // Normalize to UTC midnight so `day` is a stable grouping key.
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/**
 * Record that this visitor saw the site today. Fire-and-forget — never
 * throws, never blocks rendering. No-op for bots (no cookie) and admins
 * previewing their own work.
 */
export async function trackSiteVisit(): Promise<void> {
  try {
    const visitorId = await readVisitorId();
    if (!visitorId) return;

    const admin = await getCurrentAdmin();
    if (admin) return;

    await prisma.siteVisitorDay.upsert({
      where: {
        visitorId_day: {
          visitorId,
          day: today(),
        },
      },
      create: {
        visitorId,
        day: today(),
      },
      update: {},
    });
  } catch (error) {
    console.error("[analytics] trackSiteVisit failed", error);
  }
}

/**
 * Record that this visitor opened `photoId` today. Idempotent within a
 * single UTC day thanks to the composite PK. Fire-and-forget.
 */
export async function trackPhotoView(photoId: string): Promise<void> {
  try {
    const visitorId = await readVisitorId();
    if (!visitorId) return;

    const admin = await getCurrentAdmin();
    if (admin) return;

    await prisma.photoView.upsert({
      where: {
        photoId_visitorId_day: {
          photoId,
          visitorId,
          day: today(),
        },
      },
      create: {
        photoId,
        visitorId,
        day: today(),
      },
      update: {},
    });
  } catch (error) {
    console.error("[analytics] trackPhotoView failed", { photoId, error });
  }
}
