import "server-only";

import { prisma } from "@/lib/prisma";
import { buildDisplayUrl } from "@/lib/storage";

const DAY_MS = 24 * 60 * 60 * 1000;

function todayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function daysAgoUtc(days: number): Date {
  return new Date(todayUtc().getTime() - days * DAY_MS);
}

function pickDerivative(
  derivatives: Array<{
    kind: string;
    width: number;
    height: number;
    storageKey: string;
  }>,
  preferredKinds: string[],
) {
  for (const preferredKind of preferredKinds) {
    const match = derivatives
      .filter((derivative) => derivative.kind === preferredKind)
      .sort((left, right) => right.width - left.width)[0];

    if (match) {
      return match;
    }
  }

  return (
    [...derivatives].sort((left, right) => right.width - left.width)[0] ?? null
  );
}

export type MostViewedPhoto = {
  id: string;
  title: string | null;
  caption: string | null;
  altText: string | null;
  previewUrl: string | null;
  previewWidth: number;
  previewHeight: number;
  viewCount: number;
  viewCountLast7: number;
  event: {
    id: string;
    title: string;
    slug: string;
  };
};

/**
 * Top N photos by unique visitor-day view count. `views` joins are aggregated
 * via a Prisma groupBy; a second query fans out to hydrate photo details.
 *
 * Because each row in PhotoView is already deduped on (photoId, visitorId,
 * day) by the composite PK, `_count` is exactly the unique-viewer-day total.
 */
export async function getMostViewedPhotos(
  limit = 20,
): Promise<MostViewedPhoto[]> {
  const since7 = daysAgoUtc(7);

  const [totalGroups, recentGroups] = await Promise.all([
    prisma.photoView.groupBy({
      by: ["photoId"],
      _count: { photoId: true },
      orderBy: { _count: { photoId: "desc" } },
      take: limit,
    }),
    prisma.photoView.groupBy({
      by: ["photoId"],
      where: { day: { gte: since7 } },
      _count: { photoId: true },
    }),
  ]);

  if (totalGroups.length === 0) {
    return [];
  }

  const recentByPhoto = new Map<string, number>(
    recentGroups.map((row) => [row.photoId, row._count.photoId]),
  );

  const photoIds = totalGroups.map((row) => row.photoId);
  const photos = await prisma.photo.findMany({
    where: { id: { in: photoIds } },
    include: {
      event: {
        select: { id: true, title: true, slug: true },
      },
      derivatives: {
        orderBy: { width: "desc" },
      },
    },
  });

  const photosById = new Map(photos.map((photo) => [photo.id, photo]));

  return totalGroups
    .map((row) => {
      const photo = photosById.get(row.photoId);
      if (!photo) return null;

      const preview = pickDerivative(photo.derivatives, [
        "THUMBNAIL",
        "GRID",
        "VIEWER",
      ]);

      return {
        id: photo.id,
        title: photo.title,
        caption: photo.caption,
        altText: photo.altText,
        previewUrl: buildDisplayUrl(preview?.storageKey),
        previewWidth: preview?.width ?? photo.width ?? 800,
        previewHeight: preview?.height ?? photo.height ?? 1000,
        viewCount: row._count.photoId,
        viewCountLast7: recentByPhoto.get(row.photoId) ?? 0,
        event: photo.event,
      } satisfies MostViewedPhoto;
    })
    .filter((row): row is MostViewedPhoto => row !== null);
}

export type VisitorDayPoint = {
  day: Date;
  visitors: number;
};

/**
 * Unique visitors per day for the last `days` days (inclusive of today).
 * Fills gaps with zero so the series is continuous for charting.
 */
export async function getUniqueVisitorsByDay(
  days = 30,
): Promise<VisitorDayPoint[]> {
  const since = daysAgoUtc(days - 1);

  const rows = await prisma.siteVisitorDay.groupBy({
    by: ["day"],
    where: { day: { gte: since } },
    _count: { visitorId: true },
  });

  const countsByIso = new Map<string, number>(
    rows.map((row) => [row.day.toISOString().slice(0, 10), row._count.visitorId]),
  );

  const result: VisitorDayPoint[] = [];
  for (let i = 0; i < days; i += 1) {
    const day = new Date(since.getTime() + i * DAY_MS);
    const iso = day.toISOString().slice(0, 10);
    result.push({ day, visitors: countsByIso.get(iso) ?? 0 });
  }
  return result;
}

export type AnalyticsSummary = {
  totalPhotoViews: number;
  totalUniqueVisitors: number;
  uniqueVisitorsToday: number;
  uniqueVisitorsLast7: number;
  uniqueVisitorsLast30: number;
};

export async function getAnalyticsSummary(): Promise<AnalyticsSummary> {
  const today = todayUtc();
  const since7 = daysAgoUtc(6);
  const since30 = daysAgoUtc(29);

  const [
    totalPhotoViews,
    totalUniqueVisitors,
    visitorsToday,
    visitorsLast7,
    visitorsLast30,
  ] = await Promise.all([
    prisma.photoView.count(),
    // All-time unique visitors: distinct visitorId across SiteVisitorDay.
    prisma.siteVisitorDay
      .groupBy({ by: ["visitorId"], _count: { visitorId: true } })
      .then((rows) => rows.length),
    prisma.siteVisitorDay.count({ where: { day: today } }),
    prisma.siteVisitorDay
      .groupBy({
        by: ["visitorId"],
        where: { day: { gte: since7 } },
      })
      .then((rows) => rows.length),
    prisma.siteVisitorDay
      .groupBy({
        by: ["visitorId"],
        where: { day: { gte: since30 } },
      })
      .then((rows) => rows.length),
  ]);

  return {
    totalPhotoViews,
    totalUniqueVisitors,
    uniqueVisitorsToday: visitorsToday,
    uniqueVisitorsLast7: visitorsLast7,
    uniqueVisitorsLast30: visitorsLast30,
  };
}
