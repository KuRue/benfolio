import "server-only";

import type {
  Prisma,
} from "../../../prisma/generated/client/client";

import { getActiveDuplicateGroupCountForEvent } from "@/lib/admin-duplicates";
import {
  buildImportItemWhere,
  normalizeImportAdminFilters,
  parseStorageImportPayload,
} from "@/lib/imports";
import { prisma } from "@/lib/prisma";
import { getEffectiveTakenAt } from "@/lib/photo-order";
import { buildDisplayUrl } from "@/lib/storage";

const defaultSiteProfile = {
  id: "default",
  displayName: "Your Studio",
  handle: null,
  headline: "Event photography arranged with the feel of the original night.",
  bio: "A mobile-first archive for event coverage, client galleries, and private releases.",
  location: null,
  contactEmail: null,
  websiteUrl: null,
  instagramUrl: null,
  avatarOriginalKey: null,
  avatarDisplayKey: null,
  coverOriginalKey: null,
  coverDisplayKey: null,
  coverFocalX: 50,
  coverFocalY: 50,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

const EVENT_PHOTO_PAGE_SIZE = 18;
const eventPhotoStatusFilters = new Set([
  "ALL",
  "UPLOADED",
  "PROCESSING",
  "READY",
  "FAILED",
] as const);

type AdminEventPhotoStatusFilter =
  | "ALL"
  | "UPLOADED"
  | "PROCESSING"
  | "READY"
  | "FAILED";

export function normalizeAdminEventPhotoFilters(filters?: {
  status?: string | null;
  query?: string | null;
  page?: string | null;
}) {
  const status = eventPhotoStatusFilters.has(
    (filters?.status ?? "ALL") as AdminEventPhotoStatusFilter,
  )
    ? ((filters?.status ?? "ALL") as AdminEventPhotoStatusFilter)
    : "ALL";
  const query = filters?.query?.trim() ?? "";
  const parsedPage = Number.parseInt(filters?.page ?? "1", 10);
  const page =
    Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  return {
    status,
    query,
    page,
    pageSize: EVENT_PHOTO_PAGE_SIZE,
  };
}

function buildAdminEventPhotoWhere(args: {
  eventId: string;
  status: AdminEventPhotoStatusFilter;
  query: string;
}) {
  const where: Prisma.PhotoWhereInput = {
    eventId: args.eventId,
    ...(args.status !== "ALL" ? { processingState: args.status } : {}),
  };

  if (args.query) {
    where.OR = [
      {
        id: {
          contains: args.query,
        },
      },
      {
        originalFilename: {
          contains: args.query,
          mode: "insensitive",
        },
      },
      {
        caption: {
          contains: args.query,
          mode: "insensitive",
        },
      },
      {
        altText: {
          contains: args.query,
          mode: "insensitive",
        },
      },
      {
        tags: {
          some: {
            tag: {
              OR: [
                {
                  name: {
                    contains: args.query,
                    mode: "insensitive",
                  },
                },
                {
                  slug: {
                    contains: args.query.toLowerCase(),
                  },
                },
                {
                  aliases: {
                    some: {
                      OR: [
                        {
                          name: {
                            contains: args.query,
                            mode: "insensitive",
                          },
                        },
                        {
                          slug: {
                            contains: args.query.toLowerCase(),
                          },
                        },
                      ],
                    },
                  },
                },
              ],
            },
          },
        },
      },
    ];
  }

  return where;
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

export async function getAdminDashboardData() {
  const [eventsByVisibility, recentEvents, photoCount, importJobCount] = await Promise.all([
    prisma.event.groupBy({
      by: ["visibility"],
      _count: true,
    }),
    prisma.event.findMany({
      orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }],
      take: 6,
      include: {
        _count: {
          select: {
            photos: true,
          },
        },
      },
    }),
    prisma.photo.count(),
    prisma.importJob.count({
      where: {
        type: "STORAGE_IMPORT",
      },
    }),
  ]);

  return {
    importJobCount,
    photoCount,
    recentEvents,
    visibilitySummary: eventsByVisibility.reduce<Record<string, number>>(
      (summary, row) => {
        summary[row.visibility] = row._count;
        return summary;
      },
      {},
    ),
  };
}

export async function getAdminEventList() {
  return prisma.event.findMany({
    orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }],
    include: {
      _count: {
        select: {
          photos: true,
        },
      },
    },
  });
}

export async function getAdminEventOptions() {
  return prisma.event.findMany({
    orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      slug: true,
      eventDate: true,
      visibility: true,
    },
  });
}

export async function getAdminEventById(eventId: string) {
  const event = await prisma.event.findUnique({
    where: {
      id: eventId,
    },
    include: {
      _count: {
        select: {
          photos: true,
        },
      },
      photos: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          derivatives: {
            orderBy: {
              width: "desc",
            },
          },
          tags: {
            include: {
              tag: true,
            },
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      },
    },
  });

  if (!event) {
    return null;
  }

  return {
    ...event,
    photos: event.photos.map((photo) => {
      const preview = pickDerivative(photo.derivatives, ["GRID", "THUMBNAIL", "VIEWER"]);
      const effectiveTakenAt = getEffectiveTakenAt(photo);

      return {
        ...photo,
        previewUrl: buildDisplayUrl(preview?.storageKey),
        previewWidth: preview?.width ?? photo.width ?? 1200,
        previewHeight: preview?.height ?? photo.height ?? 1500,
        effectiveTakenAt,
        tags: photo.tags.map((photoTag) => photoTag.tag),
        isCover: photoMatchesAsset(
          photo,
          {
            originalKey: event.coverOriginalKey,
            displayKey: event.coverDisplayKey,
          },
        ),
      };
    }),
  };
}

export async function getAdminEventEditorData(
  eventId: string,
  filters?: {
    status?: string | null;
    query?: string | null;
    page?: string | null;
  },
) {
  const normalizedFilters = normalizeAdminEventPhotoFilters(filters);
  const event = await prisma.event.findUnique({
    where: {
      id: eventId,
    },
    select: {
      id: true,
      title: true,
      slug: true,
      eventDate: true,
      location: true,
      description: true,
      visibility: true,
      photoOrderMode: true,
      coverOriginalKey: true,
      coverDisplayKey: true,
      _count: {
        select: {
          photos: true,
        },
      },
    },
  });

  if (!event) {
    return null;
  }

  const where = buildAdminEventPhotoWhere({
    eventId,
    status: normalizedFilters.status,
    query: normalizedFilters.query,
  });

  const [statusSummaryRows, filteredCount, duplicateCandidateCount] = await Promise.all([
    prisma.photo.groupBy({
      by: ["processingState"],
      where: {
        eventId,
      },
      _count: true,
    }),
    prisma.photo.count({
      where,
    }),
    getActiveDuplicateGroupCountForEvent(eventId),
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredCount / normalizedFilters.pageSize),
  );
  const page = Math.min(normalizedFilters.page, totalPages);
  const photos = await prisma.photo.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    skip: (page - 1) * normalizedFilters.pageSize,
    take: normalizedFilters.pageSize,
    include: {
      derivatives: {
        orderBy: {
          width: "desc",
        },
      },
      tags: {
        include: {
          tag: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  return {
    ...event,
    filters: {
      ...normalizedFilters,
      page,
    },
    pagination: {
      page,
      pageSize: normalizedFilters.pageSize,
      totalCount: filteredCount,
      totalPages,
      pagePhotoCount: photos.length,
      hasPreviousPage: page > 1,
      hasNextPage: page < totalPages,
    },
    duplicateCandidateCount,
    photoSummary: statusSummaryRows.reduce<
      Record<AdminEventPhotoStatusFilter, number> & { total: number; filteredCount: number }
    >(
      (summary, row) => {
        summary[row.processingState] = row._count;
        return summary;
      },
      {
        ALL: event._count.photos,
        UPLOADED: 0,
        PROCESSING: 0,
        READY: 0,
        FAILED: 0,
        total: event._count.photos,
        filteredCount,
      },
    ),
    photos: photos.map((photo) => {
      const preview = pickDerivative(photo.derivatives, ["GRID", "THUMBNAIL", "VIEWER"]);
      const effectiveTakenAt = getEffectiveTakenAt(photo);

      return {
        ...photo,
        previewUrl: buildDisplayUrl(preview?.storageKey),
        previewWidth: preview?.width ?? photo.width ?? 1200,
        previewHeight: preview?.height ?? photo.height ?? 1500,
        effectiveTakenAt,
        tags: photo.tags.map((photoTag) => photoTag.tag),
        isCover: photoMatchesAsset(photo, {
          originalKey: event.coverOriginalKey,
          displayKey: event.coverDisplayKey,
        }),
      };
    }),
  };
}

export async function getAdminSiteProfileData() {
  const [siteProfile, readyPhotos] = await Promise.all([
    prisma.siteProfile.findUnique({
      where: { id: "default" },
    }),
    prisma.photo.findMany({
      where: {
        processingState: "READY",
      },
      orderBy: [{ createdAt: "desc" }],
      include: {
        event: {
          select: {
            id: true,
            title: true,
            slug: true,
            eventDate: true,
          },
        },
        derivatives: {
          orderBy: [{ width: "desc" }],
        },
      },
    }),
  ]);

  const mergedSiteProfile = {
    ...defaultSiteProfile,
    ...siteProfile,
  };

  return {
    siteProfile: mergedSiteProfile,
    libraryPhotos: readyPhotos.map((photo) => {
      const preview = pickDerivative(photo.derivatives, ["GRID", "THUMBNAIL", "VIEWER"]);

      return {
        id: photo.id,
        originalFilename: photo.originalFilename,
        createdAt: photo.createdAt,
        caption: photo.caption,
        altText: photo.altText,
        event: photo.event,
        previewUrl: buildDisplayUrl(preview?.storageKey),
        previewWidth: preview?.width ?? photo.width ?? 1200,
        previewHeight: preview?.height ?? photo.height ?? 1500,
        isCurrentHero: photoMatchesAsset(photo, {
          originalKey: mergedSiteProfile.coverOriginalKey,
          displayKey: mergedSiteProfile.coverDisplayKey,
        }),
        isCurrentAvatar: photoMatchesAsset(photo, {
          originalKey: mergedSiteProfile.avatarOriginalKey,
          displayKey: mergedSiteProfile.avatarDisplayKey,
        }),
      };
    }),
  };
}

export async function getAdminImportsData(filters?: {
  status?: string | null;
  query?: string | null;
  visibility?: string | null;
}) {
  const normalizedFilters = normalizeImportAdminFilters(filters);
  const itemWhere = buildImportItemWhere(filters);

  const jobWhere: Prisma.ImportJobWhereInput = {
    type: "STORAGE_IMPORT" as const,
    ...(normalizedFilters.status !== "ALL" || normalizedFilters.query || normalizedFilters.visibility !== "ALL"
      ? { items: { some: itemWhere } }
      : {}),
  };

  const [
    importJobsByStatus,
    importItemsByStatus,
    recentImportJobs,
    recentImportItems,
    failedCount,
    cleanupFailedCount,
    dismissibleCount,
  ] = await Promise.all([
    prisma.importJob.groupBy({
      by: ["status"],
      where: {
        type: "STORAGE_IMPORT",
      },
      _count: true,
    }),
    prisma.importItem.groupBy({
      by: ["status"],
      where: {
        source: "STORAGE_IMPORT",
      },
      _count: true,
    }),
    prisma.importJob.findMany({
      where: jobWhere,
      orderBy: [{ createdAt: "desc" }],
      take: 16,
      include: {
        event: {
          select: {
            id: true,
            slug: true,
            title: true,
          },
        },
        requestedBy: {
          select: {
            displayName: true,
          },
        },
      },
    }),
    prisma.importItem.findMany({
      where: itemWhere,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: 120,
      include: {
        events: {
          orderBy: [{ createdAt: "asc" }],
        },
        event: {
          select: {
            id: true,
            slug: true,
            title: true,
          },
        },
        photo: {
          select: {
            id: true,
            processingState: true,
          },
        },
        importJob: {
          select: {
            id: true,
            status: true,
            createdAt: true,
            payloadJson: true,
          },
        },
      },
    }),
    prisma.importItem.count({
      where: {
        ...itemWhere,
        status: "FAILED",
      },
    }),
    prisma.importItem.count({
      where: {
        ...itemWhere,
        status: "FAILED",
        cleanupStatus: "FAILED",
      },
    }),
    prisma.importItem.count({
      where: {
        ...itemWhere,
        status: {
          in: ["COMPLETE", "SKIPPED"],
        },
        dismissedAt: null,
      },
    }),
  ]);

  const itemCountsByJob = recentImportJobs.length
    ? await prisma.importItem.groupBy({
        by: ["importJobId", "status"],
        where: {
          importJobId: {
            in: recentImportJobs.map((job) => job.id),
          },
        },
        _count: true,
      })
    : [];

  const countsByJob = itemCountsByJob.reduce<Record<string, Record<string, number>>>(
    (summary, row) => {
      summary[row.importJobId] ??= {};
      summary[row.importJobId]![row.status] = row._count;
      return summary;
    },
    {},
  );

  const visibleHashes = [
    ...new Set(
      recentImportItems
        .map((item) => item.contentHashSha256)
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  const relatedHashItems = visibleHashes.length
    ? await prisma.importItem.findMany({
        where: {
          contentHashSha256: {
            in: visibleHashes,
          },
        },
        select: {
          id: true,
          sourceKey: true,
          eventSlug: true,
          contentHashSha256: true,
          event: {
            select: {
              id: true,
              slug: true,
              title: true,
            },
          },
          photo: {
            select: {
              id: true,
            },
          },
        },
      })
    : [];

  const duplicatesByHash = relatedHashItems.reduce<
    Record<
      string,
      Array<{
        id: string;
        sourceKey: string;
        eventSlug: string;
        event: {
          id: string;
          slug: string;
          title: string;
        } | null;
        photo: {
          id: string;
        } | null;
      }>
    >
  >((summary, item) => {
    if (!item.contentHashSha256) {
      return summary;
    }

    summary[item.contentHashSha256] ??= [];
    summary[item.contentHashSha256]!.push({
      id: item.id,
      sourceKey: item.sourceKey,
      eventSlug: item.eventSlug,
      event: item.event,
      photo: item.photo,
    });
    return summary;
  }, {});

  return {
    filters: normalizedFilters,
    jobStatusSummary: importJobsByStatus.reduce<Record<string, number>>(
      (summary, row) => {
        summary[row.status] = row._count;
        return summary;
      },
      {},
    ),
    itemStatusSummary: importItemsByStatus.reduce<Record<string, number>>(
      (summary, row) => {
        summary[row.status] = row._count;
        return summary;
      },
      {},
    ),
    bulkActionSummary: {
      retryFailed: failedCount,
      retryCleanupFailed: cleanupFailedCount,
      dismissTerminal: dismissibleCount,
    },
    recentImportJobs: recentImportJobs.map((job) => {
      const payload = parseStorageImportPayload(job.payloadJson);
      const itemCounts = countsByJob[job.id] ?? {};

      return {
        id: job.id,
        type: job.type,
        source: job.source,
        status: job.status,
        eventId: job.eventId,
        requestedById: job.requestedById,
        payloadJson: job.payloadJson,
        totalItems: job.totalItems,
        processedItems: job.processedItems,
        errorMessage: job.errorMessage,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        event: job.event,
        requestedBy: job.requestedBy,
        payload,
        trigger: payload?.trigger ?? "scan",
        adapterId: payload?.adapterId ?? null,
        eventSlug: payload?.eventSlug ?? job.event?.slug ?? null,
        sourcePrefix: payload?.sourcePrefix ?? null,
        cleanupMode: payload?.cleanupMode ?? null,
        fileCount: payload?.files.length ?? job.totalItems,
        sourcePathExample: payload?.files[0]?.sourceKey ?? null,
        itemCounts: {
          pending: itemCounts.PENDING ?? 0,
          running: itemCounts.RUNNING ?? 0,
          complete: itemCounts.COMPLETE ?? 0,
          failed: itemCounts.FAILED ?? 0,
          skipped: itemCounts.SKIPPED ?? 0,
        },
      };
    }),
    recentImportItems: recentImportItems.map((item) => ({
      id: item.id,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      importJobId: item.importJobId,
      source: item.source,
      sourceKey: item.sourceKey,
      sourceFilename: item.sourceFilename,
      sourceByteSize: item.sourceByteSize,
      sourceLastModified: item.sourceLastModified,
      sourceProvider: item.sourceProvider,
      sourceEtag: item.sourceEtag,
      sourceVersion: item.sourceVersion,
      contentHashSha256: item.contentHashSha256,
      eventSlug: item.eventSlug,
      eventId: item.eventId,
      photoId: item.photoId,
      status: item.status,
      cleanupMode: item.cleanupMode,
      cleanupStatus: item.cleanupStatus,
      cleanupTargetKey: item.cleanupTargetKey,
      cleanupError: item.cleanupError,
      skipReason: item.skipReason,
      errorMessage: item.errorMessage,
      startedAt: item.startedAt,
      completedAt: item.completedAt,
      dismissedAt: item.dismissedAt,
      event: item.event,
      photo: item.photo,
      importJob: item.importJob,
      trigger: parseStorageImportPayload(item.importJob.payloadJson)?.trigger ?? "scan",
      timeline: item.events.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        label: event.label,
        detail: event.detail,
        createdAt: event.createdAt,
        metadataJson: event.metadataJson,
      })),
      possibleDuplicates: item.contentHashSha256
        ? (duplicatesByHash[item.contentHashSha256] ?? [])
            .filter(
              (candidate) =>
                candidate.id !== item.id && candidate.sourceKey !== item.sourceKey,
            )
            .slice(0, 4)
        : [],
    })),
  };
}
