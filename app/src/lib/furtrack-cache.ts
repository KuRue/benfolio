import "server-only";

import type { Prisma } from "../../../prisma/generated/client/client";

import { parseFurtrackTags } from "@/lib/furtrack";
import { prisma } from "@/lib/prisma";
import { enqueueImportProcessing } from "@/lib/queue";

const FURTRACK_CACHE_SYNC_POST_LIMIT = 50_000;

type CachedPostForMatch = {
  postId: string;
  submitUserId: string | null;
  metaFingerprint: string | null;
  metaFiletype: string | null;
  metaWidth: number | null;
  metaHeight: number | null;
  externalUrl: string | null;
  imageUrl: string | null;
  dHash: string | null;
  averageHash: string | null;
  tags: Array<{
    category: "CHARACTER" | "EVENT" | "SPECIES" | "MAKER" | "GENERAL";
    slug: string;
    name: string;
    rawValue: string;
  }>;
};

function isCacheSyncPayload(value: Prisma.JsonValue | null) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    value.kind === "furtrack-cache-sync"
  );
}

function furtrackPublicPostUrl(postId: string) {
  return `https://www.furtrack.com/p/${postId}`;
}

function cacheTagWhere(tags: string[]): Prisma.FurtrackCachedTagWhereInput[] {
  const parsedTags = parseFurtrackTags(tags);
  const rawFilters: Prisma.FurtrackCachedTagWhereInput[] = tags.map((tag) => ({
    rawValue: {
      equals: tag,
      mode: "insensitive",
    },
  }));
  const parsedFilters: Prisma.FurtrackCachedTagWhereInput[] = [];

  for (const tag of parsedTags) {
    if (tag.slug) {
      parsedFilters.push({
        category: tag.category,
        slug: tag.slug,
      });
    }
  }

  return [...rawFilters, ...parsedFilters];
}

function toMatchCandidate(post: CachedPostForMatch) {
  if (!post.dHash || !post.averageHash) {
    return null;
  }

  return {
    post: {
      post: {
        postId: post.postId,
        submitUserId: post.submitUserId ?? "",
        metaFingerprint: post.metaFingerprint ?? "",
        metaFiletype: post.metaFiletype ?? "",
        metaWidth: post.metaWidth,
        metaHeight: post.metaHeight,
      },
      tags: post.tags.map((tag) => ({
        category: tag.category,
        name: tag.name,
        slug: tag.slug,
        aliases: [],
        rawValues: [tag.rawValue],
      })),
      externalUrl: post.externalUrl ?? furtrackPublicPostUrl(post.postId),
      imageUrl: post.imageUrl ?? "",
    },
    fingerprint: {
      hash: post.dHash,
      averageHash: post.averageHash,
      width: post.metaWidth,
      height: post.metaHeight,
    },
  };
}

export async function loadCachedFurtrackCandidates(args: {
  tags: string[];
  postIds: string[];
  maxCandidates: number;
}) {
  const normalizedPostIds = [
    ...new Set(args.postIds.map((postId) => postId.trim()).filter(Boolean)),
  ];
  const tagFilters = cacheTagWhere(args.tags);
  const postsById = new Map<string, CachedPostForMatch>();

  if (normalizedPostIds.length) {
    const posts = await prisma.furtrackCachedPost.findMany({
      where: {
        postId: {
          in: normalizedPostIds,
        },
        syncStatus: "READY",
        dHash: {
          not: null,
        },
        averageHash: {
          not: null,
        },
      },
      include: {
        tags: true,
      },
      take: args.maxCandidates,
    });

    for (const post of posts) {
      postsById.set(post.postId, post);
    }
  }

  if (tagFilters.length && postsById.size < args.maxCandidates) {
    const rows = await prisma.furtrackCachedTag.findMany({
      where: {
        OR: tagFilters,
        post: {
          syncStatus: "READY",
          dHash: {
            not: null,
          },
          averageHash: {
            not: null,
          },
        },
      },
      orderBy: {
        post: {
          updatedAt: "desc",
        },
      },
      take: args.maxCandidates * 3,
      include: {
        post: {
          include: {
            tags: true,
          },
        },
      },
    });

    for (const row of rows) {
      if (postsById.size >= args.maxCandidates) {
        break;
      }

      postsById.set(row.postId, row.post);
    }
  }

  return [...postsById.values()]
    .slice(0, args.maxCandidates)
    .map(toMatchCandidate)
    .filter((candidate): candidate is NonNullable<ReturnType<typeof toMatchCandidate>> =>
      Boolean(candidate),
    );
}

export async function getAdminFurtrackCacheSummary() {
  const [statusRows, totalTags, recentJobs, lastReadyPost] = await Promise.all([
    prisma.furtrackCachedPost.groupBy({
      by: ["syncStatus"],
      _count: true,
    }),
    prisma.furtrackCachedTag.count(),
    prisma.importJob.findMany({
      where: {
        type: "FURTRACK_SYNC",
      },
      orderBy: [{ createdAt: "desc" }],
      take: 12,
      select: {
        id: true,
        status: true,
        totalItems: true,
        processedItems: true,
        errorMessage: true,
        payloadJson: true,
        createdAt: true,
        updatedAt: true,
        finishedAt: true,
      },
    }),
    prisma.furtrackCachedPost.findFirst({
      where: {
        syncStatus: "READY",
      },
      orderBy: {
        lastFetchedAt: "desc",
      },
      select: {
        lastFetchedAt: true,
      },
    }),
  ]);
  const counts = statusRows.reduce<Record<string, number>>((accumulator, row) => {
    accumulator[row.syncStatus] = row._count;
    return accumulator;
  }, {});
  const cacheJobs = recentJobs.filter((job) => isCacheSyncPayload(job.payloadJson));

  return {
    readyPostCount: counts.READY ?? 0,
    failedPostCount: counts.FAILED ?? 0,
    missingPostCount: counts.MISSING ?? 0,
    pendingPostCount: counts.PENDING ?? 0,
    tagCount: totalTags,
    lastFetchedAt: lastReadyPost?.lastFetchedAt?.toISOString() ?? null,
    recentJobs: cacheJobs.slice(0, 5).map((job) => ({
      id: job.id,
      status: job.status,
      totalItems: job.totalItems,
      processedItems: job.processedItems,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      finishedAt: job.finishedAt?.toISOString() ?? null,
      payload:
        job.payloadJson &&
        typeof job.payloadJson === "object" &&
        !Array.isArray(job.payloadJson)
          ? {
              tag: typeof job.payloadJson.tag === "string" ? job.payloadJson.tag : null,
              pages:
                typeof job.payloadJson.pages === "number" ? job.payloadJson.pages : null,
              maxPosts:
                typeof job.payloadJson.maxPosts === "number"
                  ? job.payloadJson.maxPosts
                  : null,
              syncAll:
                typeof job.payloadJson.syncAll === "boolean"
                  ? job.payloadJson.syncAll
                  : null,
            }
          : null,
    })),
  };
}

export async function enqueueFurtrackCacheSync(args: {
  tag: string;
  refreshExisting: boolean;
  requestedById?: string | null;
}) {
  const tag = args.tag.trim();

  if (!tag) {
    throw new Error("Choose a Furtrack tag to sync.");
  }

  const payload = {
    kind: "furtrack-cache-sync",
    version: 1,
    tag,
    syncAll: true,
    maxPosts: FURTRACK_CACHE_SYNC_POST_LIMIT,
    refreshExisting: args.refreshExisting,
    requestedAt: new Date().toISOString(),
  } satisfies Prisma.InputJsonObject;
  const job = await prisma.importJob.create({
    data: {
      type: "FURTRACK_SYNC",
      source: "FURTRACK",
      status: "PENDING",
      requestedById: args.requestedById ?? null,
      totalItems: 0,
      processedItems: 0,
      payloadJson: payload,
    },
    select: {
      id: true,
    },
  });

  await enqueueImportProcessing(job.id);

  return {
    id: job.id,
  };
}
