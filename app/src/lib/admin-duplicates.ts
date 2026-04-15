import "server-only";

import {
  Prisma,
  type DuplicateReviewDecision,
  type DuplicateReviewScope,
} from "../../../prisma/generated/client/client";

import { parseStorageImportPayload } from "@/lib/imports";
import { getEffectiveTakenAt } from "@/lib/photo-order";
import { prisma } from "@/lib/prisma";
import { buildDisplayUrl } from "@/lib/storage";

export type DuplicateScopeFilter = "LIBRARY" | "EVENT";
export type DuplicateVisibilityFilter = "ACTIVE" | "ALL";

const DUPLICATE_GROUP_PAGE_SIZE = 10;

type DuplicateGroupRow = {
  contentHashSha256: string;
  photoCount: number;
  eventCount: number;
  latestPhotoCreatedAt: Date;
  reviewDecision: DuplicateReviewDecision | null;
  reviewedAt: Date | null;
  reviewPhotoCountSnapshot: number | null;
  reviewLatestPhotoCreatedAtSnapshot: Date | null;
};

function pickDerivative(
  derivatives: Array<{
    kind: string;
    width: number;
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

  return [...derivatives].sort((left, right) => right.width - left.width)[0] ?? null;
}

function photoMatchesAsset(
  photo: {
    originalKey: string;
    derivatives: Array<{
      storageKey: string;
    }>;
  },
  asset: {
    originalKey: string | null;
    displayKey: string | null;
  },
) {
  return (
    photo.originalKey === asset.originalKey ||
    photo.derivatives.some((derivative) => derivative.storageKey === asset.displayKey)
  );
}

function normalizePage(page: string | null | undefined) {
  const parsed = Number.parseInt(page ?? "1", 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
}

export function normalizeDuplicateFilters(filters?: {
  scope?: string | null;
  eventId?: string | null;
  visibility?: string | null;
  page?: string | null;
}) {
  const scope =
    filters?.scope === "EVENT" && filters.eventId ? ("EVENT" as const) : ("LIBRARY" as const);
  const visibility =
    filters?.visibility === "ALL" ? ("ALL" as const) : ("ACTIVE" as const);

  return {
    scope,
    eventId: scope === "EVENT" ? filters?.eventId?.trim() ?? "" : "",
    visibility,
    page: normalizePage(filters?.page),
    pageSize: DUPLICATE_GROUP_PAGE_SIZE,
  };
}

export function getDuplicateReviewScopeKey(args: {
  scope: DuplicateScopeFilter;
  eventId?: string | null;
}) {
  return args.scope === "EVENT" && args.eventId ? `event:${args.eventId}` : "global";
}

function toNumber(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  return 0;
}

function buildDuplicateBaseClauses(args: {
  scope: DuplicateScopeFilter;
  eventId?: string | null;
  visibility: DuplicateVisibilityFilter;
}) {
  const scopeKey = getDuplicateReviewScopeKey({
    scope: args.scope,
    eventId: args.eventId,
  });
  const eventWhere =
    args.scope === "EVENT" && args.eventId
      ? Prisma.sql`AND p."eventId" = ${args.eventId}`
      : Prisma.empty;
  const activeReviewClause =
    args.visibility === "ACTIVE"
      ? Prisma.sql`
          AND (
            COUNT(dr."id") = 0
            OR MAX(dr."photoCountSnapshot") < COUNT(*)
            OR MAX(dr."latestPhotoCreatedAtSnapshot") < MAX(p."createdAt")
          )
        `
      : Prisma.empty;

  return {
    scopeKey,
    eventWhere,
    activeReviewClause,
  };
}

async function queryDuplicateGroupCount(args: {
  scope: DuplicateScopeFilter;
  eventId?: string | null;
  visibility: DuplicateVisibilityFilter;
}) {
  const clauses = buildDuplicateBaseClauses(args);
  const result = await prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
    SELECT COUNT(*)::int AS "count"
    FROM (
      SELECT p."contentHashSha256"
      FROM "Photo" p
      LEFT JOIN "DuplicateReview" dr
        ON dr."scopeKey" = ${clauses.scopeKey}
       AND dr."contentHashSha256" = p."contentHashSha256"
      WHERE p."contentHashSha256" IS NOT NULL
      ${clauses.eventWhere}
      GROUP BY p."contentHashSha256"
      HAVING COUNT(*) > 1
      ${clauses.activeReviewClause}
    ) duplicate_groups
  `);

  return toNumber(result[0]?.count ?? 0);
}

async function queryDuplicateGroups(args: {
  scope: DuplicateScopeFilter;
  eventId?: string | null;
  visibility: DuplicateVisibilityFilter;
  page: number;
  pageSize: number;
}) {
  const clauses = buildDuplicateBaseClauses(args);
  const offset = (args.page - 1) * args.pageSize;

  return prisma.$queryRaw<DuplicateGroupRow[]>(Prisma.sql`
    SELECT
      p."contentHashSha256" AS "contentHashSha256",
      COUNT(*)::int AS "photoCount",
      COUNT(DISTINCT p."eventId")::int AS "eventCount",
      MAX(p."createdAt") AS "latestPhotoCreatedAt",
      MAX(dr."decision")::text AS "reviewDecision",
      MAX(dr."updatedAt") AS "reviewedAt",
      MAX(dr."photoCountSnapshot")::int AS "reviewPhotoCountSnapshot",
      MAX(dr."latestPhotoCreatedAtSnapshot") AS "reviewLatestPhotoCreatedAtSnapshot"
    FROM "Photo" p
    LEFT JOIN "DuplicateReview" dr
      ON dr."scopeKey" = ${clauses.scopeKey}
     AND dr."contentHashSha256" = p."contentHashSha256"
    WHERE p."contentHashSha256" IS NOT NULL
    ${clauses.eventWhere}
    GROUP BY p."contentHashSha256"
    HAVING COUNT(*) > 1
    ${clauses.activeReviewClause}
    ORDER BY COUNT(*) DESC, MAX(p."createdAt") DESC
    LIMIT ${args.pageSize}
    OFFSET ${offset}
  `);
}

export async function getActiveDuplicateGroupCountForEvent(eventId: string) {
  return queryDuplicateGroupCount({
    scope: "EVENT",
    eventId,
    visibility: "ACTIVE",
  });
}

export async function getAdminDuplicateReviewData(filters?: {
  scope?: string | null;
  eventId?: string | null;
  visibility?: string | null;
  page?: string | null;
}) {
  const normalized = normalizeDuplicateFilters(filters);
  const [eventOptions, totalGroups, groupRows] = await Promise.all([
    prisma.event.findMany({
      orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        slug: true,
        eventDate: true,
      },
    }),
    queryDuplicateGroupCount(normalized),
    queryDuplicateGroups(normalized),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalGroups / normalized.pageSize));
  const page = Math.min(normalized.page, totalPages);
  const pagedRows =
    page === normalized.page
      ? groupRows
      : await queryDuplicateGroups({
          ...normalized,
          page,
        });
  const hashes = pagedRows.map((group) => group.contentHashSha256);

  const photos = hashes.length
    ? await prisma.photo.findMany({
        where: {
          contentHashSha256: {
            in: hashes,
          },
          ...(normalized.scope === "EVENT" && normalized.eventId
            ? { eventId: normalized.eventId }
            : {}),
        },
        orderBy: [
          { contentHashSha256: "asc" },
          { eventId: "asc" },
          { sortOrder: "asc" },
          { createdAt: "asc" },
        ],
        include: {
          event: {
            select: {
              id: true,
              slug: true,
              title: true,
              coverOriginalKey: true,
              coverDisplayKey: true,
            },
          },
          derivatives: {
            orderBy: [{ width: "desc" }],
          },
          importItems: {
            orderBy: [{ createdAt: "desc" }],
            take: 1,
            select: {
              id: true,
              sourceKey: true,
              status: true,
              sourceProvider: true,
              importJob: {
                select: {
                  id: true,
                  payloadJson: true,
                },
              },
            },
          },
        },
      })
    : [];

  const photosByHash = photos.reduce<
    Record<
      string,
      Array<{
        id: string;
        processingState: string;
        originalFilename: string;
        caption: string | null;
        altText: string | null;
        capturedAt: Date | null;
        takenAtOverride: Date | null;
        effectiveTakenAt: Date | null;
        createdAt: Date;
        sortOrder: number;
        isCover: boolean;
        event: {
          id: string;
          slug: string;
          title: string;
        };
        previewUrl: string | null;
        importContext: {
          sourceKey: string;
          status: string;
          sourceProvider: string | null;
          trigger: "scan" | "webhook";
        } | null;
      }>
    >
  >((summary, photo) => {
    const preview = pickDerivative(photo.derivatives, ["GRID", "THUMBNAIL", "VIEWER"]);
    const latestImport = photo.importItems[0] ?? null;
    const importPayload = latestImport
      ? parseStorageImportPayload(latestImport.importJob.payloadJson)
      : null;
    const effectiveTakenAt = getEffectiveTakenAt(photo);

    summary[photo.contentHashSha256 ?? ""] ??= [];
    summary[photo.contentHashSha256 ?? ""]!.push({
      id: photo.id,
      processingState: photo.processingState,
      originalFilename: photo.originalFilename,
      caption: photo.caption,
      altText: photo.altText,
      capturedAt: photo.capturedAt,
      takenAtOverride: photo.takenAtOverride,
      effectiveTakenAt,
      createdAt: photo.createdAt,
      sortOrder: photo.sortOrder,
      isCover: photoMatchesAsset(photo, {
        originalKey: photo.event.coverOriginalKey,
        displayKey: photo.event.coverDisplayKey,
      }),
      event: {
        id: photo.event.id,
        slug: photo.event.slug,
        title: photo.event.title,
      },
      previewUrl: buildDisplayUrl(preview?.storageKey),
      importContext: latestImport
        ? {
            sourceKey: latestImport.sourceKey,
            status: latestImport.status,
            sourceProvider: latestImport.sourceProvider,
            trigger: importPayload?.trigger ?? "scan",
          }
        : null,
    });
    return summary;
  }, {});

  return {
    filters: {
      ...normalized,
      page,
    },
    totalGroups,
    totalPages,
    eventOptions,
    duplicateGroups: pagedRows.map((group) => ({
      hash: group.contentHashSha256,
      photoCount: toNumber(group.photoCount),
      eventCount: toNumber(group.eventCount),
      latestPhotoCreatedAt: group.latestPhotoCreatedAt,
      reviewDecision: group.reviewDecision,
      reviewedAt: group.reviewedAt,
      reviewSnapshotCurrent:
        Boolean(group.reviewDecision) &&
        toNumber(group.reviewPhotoCountSnapshot) === toNumber(group.photoCount) &&
        group.reviewLatestPhotoCreatedAtSnapshot?.getTime() ===
          group.latestPhotoCreatedAt.getTime(),
      photos: photosByHash[group.contentHashSha256] ?? [],
    })),
  };
}

export async function recordDuplicateReviewDecision(args: {
  scope: DuplicateScopeFilter;
  eventId?: string | null;
  hash: string;
  decision: DuplicateReviewDecision;
}) {
  if (!args.hash.trim()) {
    throw new Error("A duplicate hash is required.");
  }

  if (args.scope === "EVENT" && !args.eventId) {
    throw new Error("Event-scoped duplicate review requires an event.");
  }

  const aggregate = await prisma.photo.aggregate({
    where: {
      contentHashSha256: args.hash,
      ...(args.scope === "EVENT" && args.eventId ? { eventId: args.eventId } : {}),
    },
    _count: {
      _all: true,
    },
    _max: {
      createdAt: true,
    },
  });

  if ((aggregate._count._all ?? 0) < 2 || !aggregate._max.createdAt) {
    throw new Error("This duplicate group is no longer active.");
  }

  const scopeKey = getDuplicateReviewScopeKey(args);
  const scope: DuplicateReviewScope = args.scope === "EVENT" ? "EVENT" : "GLOBAL";

  await prisma.duplicateReview.upsert({
    where: {
      scopeKey_contentHashSha256: {
        scopeKey,
        contentHashSha256: args.hash,
      },
    },
    update: {
      scope,
      decision: args.decision,
      eventId: args.scope === "EVENT" ? args.eventId : null,
      photoCountSnapshot: aggregate._count._all ?? 0,
      latestPhotoCreatedAtSnapshot: aggregate._max.createdAt,
    },
    create: {
      scope,
      scopeKey,
      contentHashSha256: args.hash,
      decision: args.decision,
      eventId: args.scope === "EVENT" ? args.eventId : null,
      photoCountSnapshot: aggregate._count._all ?? 0,
      latestPhotoCreatedAtSnapshot: aggregate._max.createdAt,
    },
  });

  return {
    reviewedCount: aggregate._count._all ?? 0,
  };
}
