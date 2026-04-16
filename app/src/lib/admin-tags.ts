import "server-only";

import type { Prisma } from "../../../prisma/generated/client/client";

import { prisma } from "@/lib/prisma";
import {
  normalizeTagDraft,
  normalizeTagName,
  normalizeTagSlug,
  type TagCategoryValue,
  type TagDraft,
} from "@/lib/tags";

export type ResolvedTag = {
  id: string;
  name: string;
  slug: string;
  category: TagCategoryValue;
};

export type AdminTagSearchResult = {
  id: string;
  name: string;
  slug: string;
  category: TagCategoryValue;
  updatedAt: Date;
  photoCount: number;
  aliasCount: number;
  matchedAliases: Array<{
    id: string;
    name: string;
    slug: string;
  }>;
};

function dedupePhotoIds(photoIds: string[]) {
  return [...new Set(photoIds.map((photoId) => photoId.trim()).filter(Boolean))];
}

function dedupeTagDrafts(tagDrafts: TagDraft[]) {
  const seen = new Set<string>();
  const normalized: TagDraft[] = [];

  for (const draft of tagDrafts) {
    const candidate = normalizeTagDraft(draft);

    if (!candidate) {
      continue;
    }

    const key = candidate.id
      ? `id:${candidate.id}`
      : `${candidate.category}:${candidate.slug}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(candidate);
  }

  return normalized;
}

function toResolvedTag(tag: {
  id: string;
  name: string;
  slug: string;
  category: TagCategoryValue;
}) {
  return {
    id: tag.id,
    name: tag.name,
    slug: tag.slug,
    category: tag.category,
  } satisfies ResolvedTag;
}

function buildCanonicalTagLookupWhere(draft: TagDraft): Prisma.TagWhereInput {
  return draft.id
    ? {
        id: draft.id,
      }
    : {
        category: draft.category,
        OR: [
          {
            slug: draft.slug,
          },
          {
            aliases: {
              some: {
                slug: draft.slug,
              },
            },
          },
        ],
      };
}

export function buildAdminTagSearchWhere(args: {
  query?: string | null;
  category?: TagCategoryValue | null;
  excludeTagId?: string | null;
}): Prisma.TagWhereInput {
  const query = normalizeTagName(args.query ?? "");
  const slugQuery = normalizeTagSlug(query);

  return {
    ...(args.category ? { category: args.category } : {}),
    ...(args.excludeTagId
      ? {
          id: {
            not: args.excludeTagId,
          },
        }
      : {}),
    ...(query
      ? {
          OR: [
            {
              name: {
                contains: query,
                mode: "insensitive",
              },
            },
            ...(slugQuery
              ? [
                  {
                    slug: {
                      contains: slugQuery,
                    },
                  },
                ]
              : []),
            {
              aliases: {
                some: {
                  OR: [
                    {
                      name: {
                        contains: query,
                        mode: "insensitive",
                      },
                    },
                    ...(slugQuery
                      ? [
                          {
                            slug: {
                              contains: slugQuery,
                            },
                          },
                        ]
                      : []),
                  ],
                },
              },
            },
          ],
        }
      : {}),
  } satisfies Prisma.TagWhereInput;
}

async function findCanonicalTag(draft: TagDraft) {
  const candidate = normalizeTagDraft(draft);

  if (!candidate) {
    return null;
  }

  return prisma.tag.findFirst({
    where: buildCanonicalTagLookupWhere(candidate),
    select: {
      id: true,
      name: true,
      slug: true,
      category: true,
    },
  });
}

async function findExistingTags(tagDrafts: TagDraft[]) {
  const drafts = dedupeTagDrafts(tagDrafts);

  if (!drafts.length) {
    return [];
  }

  const resolved = await Promise.all(drafts.map((draft) => findCanonicalTag(draft)));

  return resolved.filter((tag): tag is NonNullable<typeof tag> => Boolean(tag));
}

async function findOrCreateTags(tagDrafts: TagDraft[]) {
  const drafts = dedupeTagDrafts(tagDrafts);

  if (!drafts.length) {
    return [] as ResolvedTag[];
  }

  const resolved: ResolvedTag[] = [];

  for (const draft of drafts) {
    const existing = await findCanonicalTag(draft);

    if (existing) {
      resolved.push(toResolvedTag(existing));
      continue;
    }

    const normalizedDraft = normalizeTagDraft(draft);

    if (!normalizedDraft) {
      continue;
    }

    const created = await prisma.tag.create({
      data: {
        category: normalizedDraft.category,
        slug: normalizedDraft.slug!,
        name: normalizedDraft.name,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        category: true,
      },
    });

    resolved.push(toResolvedTag(created));
  }

  return resolved;
}

export async function touchTags(tagIds: string[]) {
  const ids = [...new Set(tagIds.map((tagId) => tagId.trim()).filter(Boolean))];

  if (!ids.length) {
    return;
  }

  await prisma.tag.updateMany({
    where: {
      id: {
        in: ids,
      },
    },
    data: {
      updatedAt: new Date(),
    },
  });
}

export async function searchAdminTags(args: {
  query?: string | null;
  category?: TagCategoryValue | null;
  limit?: number;
  excludeTagId?: string | null;
}) {
  const query = normalizeTagName(args.query ?? "");
  const slugQuery = normalizeTagSlug(query);
  const limit = Math.min(Math.max(args.limit ?? 12, 1), 30);

  const tags = await prisma.tag.findMany({
    where: buildAdminTagSearchWhere({
      query,
      category: args.category,
      excludeTagId: args.excludeTagId,
    }),
    select: {
      id: true,
      name: true,
      slug: true,
      category: true,
      updatedAt: true,
      _count: {
        select: {
          photos: true,
          aliases: true,
        },
      },
      aliases: query
        ? {
            where: {
              OR: [
                {
                  name: {
                    contains: query,
                    mode: "insensitive",
                  },
                },
                ...(slugQuery
                  ? [
                      {
                        slug: {
                          contains: slugQuery,
                        },
                      },
                    ]
                  : []),
              ],
            },
            orderBy: [{ name: "asc" }],
            take: 4,
            select: {
              id: true,
              name: true,
              slug: true,
            },
          }
        : {
            orderBy: [{ name: "asc" }],
            select: {
              id: true,
              name: true,
              slug: true,
            },
            take: 4,
          },
    },
    take: Math.max(limit * 3, 18),
  });

  return tags
    .map((tag) => ({
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
      category: tag.category,
      updatedAt: tag.updatedAt,
      photoCount: tag._count.photos,
      aliasCount: tag._count.aliases,
      matchedAliases: tag.aliases,
    }))
    .sort((left, right) => {
      if (!query) {
        if (left.photoCount !== right.photoCount) {
          return right.photoCount - left.photoCount;
        }

        if (left.updatedAt.getTime() !== right.updatedAt.getTime()) {
          return right.updatedAt.getTime() - left.updatedAt.getTime();
        }

        return left.name.localeCompare(right.name);
      }

      const leftExactName =
        left.name.localeCompare(query, undefined, { sensitivity: "accent" }) === 0;
      const rightExactName =
        right.name.localeCompare(query, undefined, { sensitivity: "accent" }) === 0;

      if (leftExactName !== rightExactName) {
        return leftExactName ? -1 : 1;
      }

      const leftExactSlug = Boolean(slugQuery) && left.slug === slugQuery;
      const rightExactSlug = Boolean(slugQuery) && right.slug === slugQuery;

      if (leftExactSlug !== rightExactSlug) {
        return leftExactSlug ? -1 : 1;
      }

      const leftExactAlias = Boolean(
        slugQuery &&
          left.matchedAliases.some(
            (alias) =>
              alias.slug === slugQuery ||
              alias.name.localeCompare(query, undefined, {
                sensitivity: "accent",
              }) === 0,
          ),
      );
      const rightExactAlias = Boolean(
        slugQuery &&
          right.matchedAliases.some(
            (alias) =>
              alias.slug === slugQuery ||
              alias.name.localeCompare(query, undefined, {
                sensitivity: "accent",
              }) === 0,
          ),
      );

      if (leftExactAlias !== rightExactAlias) {
        return leftExactAlias ? -1 : 1;
      }

      if (left.photoCount !== right.photoCount) {
        return right.photoCount - left.photoCount;
      }

      if (left.updatedAt.getTime() !== right.updatedAt.getTime()) {
        return right.updatedAt.getTime() - left.updatedAt.getTime();
      }

      return left.name.localeCompare(right.name);
    })
    .slice(0, limit);
}

export async function replacePhotoTags(args: {
  photoId: string;
  add?: TagDraft[];
  remove?: TagDraft[];
}) {
  const photo = await prisma.photo.findUnique({
    where: {
      id: args.photoId,
    },
    select: {
      id: true,
      eventId: true,
    },
  });

  if (!photo) {
    throw new Error("Photo not found.");
  }

  const [tagsToAdd, tagsToRemove] = await Promise.all([
    findOrCreateTags(args.add ?? []),
    findExistingTags(args.remove ?? []),
  ]);

  if (tagsToAdd.length) {
    await prisma.photoTag.createMany({
      data: tagsToAdd.map((tag) => ({
        photoId: photo.id,
        tagId: tag.id,
      })),
      skipDuplicates: true,
    });
  }

  if (tagsToRemove.length) {
    await prisma.photoTag.deleteMany({
      where: {
        photoId: photo.id,
        tagId: {
          in: tagsToRemove.map((tag) => tag.id),
        },
      },
    });
  }

  await touchTags([
    ...tagsToAdd.map((tag) => tag.id),
    ...tagsToRemove.map((tag) => tag.id),
  ]);

  return {
    eventId: photo.eventId,
    addedTagCount: tagsToAdd.length,
    removedTagCount: tagsToRemove.length,
  };
}

export async function bulkUpdatePhotoTags(args: {
  photoIds: string[];
  add?: TagDraft[];
  remove?: TagDraft[];
}) {
  const photoIds = dedupePhotoIds(args.photoIds);

  if (!photoIds.length) {
    return {
      updatedPhotoIds: [] as string[],
      eventIds: [] as string[],
      addedTagCount: 0,
      removedTagCount: 0,
    };
  }

  const photos = await prisma.photo.findMany({
    where: {
      id: {
        in: photoIds,
      },
    },
    select: {
      id: true,
      eventId: true,
    },
  });

  if (!photos.length) {
    return {
      updatedPhotoIds: [] as string[],
      eventIds: [] as string[],
      addedTagCount: 0,
      removedTagCount: 0,
    };
  }

  const [tagsToAdd, tagsToRemove] = await Promise.all([
    findOrCreateTags(args.add ?? []),
    findExistingTags(args.remove ?? []),
  ]);

  if (tagsToAdd.length) {
    await prisma.photoTag.createMany({
      data: photos.flatMap((photo) =>
        tagsToAdd.map((tag) => ({
          photoId: photo.id,
          tagId: tag.id,
        })),
      ),
      skipDuplicates: true,
    });
  }

  if (tagsToRemove.length) {
    await prisma.photoTag.deleteMany({
      where: {
        photoId: {
          in: photos.map((photo) => photo.id),
        },
        tagId: {
          in: tagsToRemove.map((tag) => tag.id),
        },
      },
    });
  }

  await touchTags([
    ...tagsToAdd.map((tag) => tag.id),
    ...tagsToRemove.map((tag) => tag.id),
  ]);

  return {
    updatedPhotoIds: photos.map((photo) => photo.id),
    eventIds: [...new Set(photos.map((photo) => photo.eventId))],
    addedTagCount: tagsToAdd.length,
    removedTagCount: tagsToRemove.length,
  };
}
