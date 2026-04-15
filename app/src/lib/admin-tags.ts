import "server-only";

import { prisma } from "@/lib/prisma";
import {
  normalizeTagDraft,
  normalizeTagName,
  type TagCategoryValue,
  type TagDraft,
} from "@/lib/tags";

type ResolvedTag = {
  id: string;
  name: string;
  slug: string;
  category: TagCategoryValue;
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

async function findExistingTags(tagDrafts: TagDraft[]) {
  const drafts = dedupeTagDrafts(tagDrafts);

  if (!drafts.length) {
    return [];
  }

  return prisma.tag.findMany({
    where: {
      OR: drafts.map((draft) =>
        draft.id
          ? { id: draft.id }
          : {
              category: draft.category,
              slug: draft.slug,
            },
      ),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      category: true,
    },
  });
}

async function findOrCreateTags(tagDrafts: TagDraft[]) {
  const drafts = dedupeTagDrafts(tagDrafts);

  if (!drafts.length) {
    return [] as ResolvedTag[];
  }

  const resolved: ResolvedTag[] = [];

  for (const draft of drafts) {
    if (draft.id) {
      const existingById = await prisma.tag.findUnique({
        where: {
          id: draft.id,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          category: true,
        },
      });

      if (existingById) {
        resolved.push(existingById);
        continue;
      }
    }

    const existing = await prisma.tag.findFirst({
      where: {
        category: draft.category,
        slug: draft.slug,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        category: true,
      },
    });

    if (existing) {
      resolved.push(existing);
      continue;
    }

    const created = await prisma.tag.create({
      data: {
        category: draft.category,
        slug: draft.slug!,
        name: draft.name,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        category: true,
      },
    });

    resolved.push(created);
  }

  return resolved;
}

export async function searchAdminTags(args: {
  query?: string | null;
  category?: TagCategoryValue | null;
  limit?: number;
}) {
  const query = normalizeTagName(args.query ?? "");
  const limit = Math.min(Math.max(args.limit ?? 12, 1), 30);

  const tags = await prisma.tag.findMany({
    where: {
      ...(args.category ? { category: args.category } : {}),
      ...(query
        ? {
            OR: [
              {
                name: {
                  contains: query,
                  mode: "insensitive",
                },
              },
              {
                slug: {
                  contains: query.toLowerCase(),
                },
              },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      category: true,
      _count: {
        select: {
          photos: true,
        },
      },
    },
    take: Math.max(limit * 2, 12),
  });

  return tags
    .sort((left, right) => {
      const leftExact = left.name.localeCompare(query, undefined, { sensitivity: "accent" }) === 0;
      const rightExact =
        right.name.localeCompare(query, undefined, { sensitivity: "accent" }) === 0;

      if (leftExact !== rightExact) {
        return leftExact ? -1 : 1;
      }

      if (left._count.photos !== right._count.photos) {
        return right._count.photos - left._count.photos;
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

  return {
    updatedPhotoIds: photos.map((photo) => photo.id),
    eventIds: [...new Set(photos.map((photo) => photo.eventId))],
    addedTagCount: tagsToAdd.length,
    removedTagCount: tagsToRemove.length,
  };
}
