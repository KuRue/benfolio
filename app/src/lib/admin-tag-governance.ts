import "server-only";

import type { Prisma } from "../../../prisma/generated/client/client";

import { searchAdminTags } from "@/lib/admin-tags";
import { getEffectiveTakenAt } from "@/lib/photo-order";
import { prisma } from "@/lib/prisma";
import { buildDisplayUrl } from "@/lib/storage";
import {
  normalizeTagName,
  normalizeTagSlug,
  type TagCategoryValue,
} from "@/lib/tags";

const TAG_BROWSER_PAGE_SIZE = 24;
const tagSortOptions = new Set(["recent", "usage", "name"] as const);

type AdminTagSort = "recent" | "usage" | "name";

type TagConflict = {
  type: "canonical" | "alias";
  tag: {
    id: string;
    name: string;
    slug: string;
    category: TagCategoryValue;
  };
  alias?: {
    id: string;
    name: string;
    slug: string;
  };
};

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

export function normalizeAdminTagFilters(filters?: {
  category?: string | null;
  q?: string | null;
  sort?: string | null;
  page?: string | null;
}) {
  const category =
    filters?.category === "CHARACTER" ||
    filters?.category === "EVENT" ||
    filters?.category === "SPECIES" ||
    filters?.category === "MAKER" ||
    filters?.category === "GENERAL"
      ? filters.category
      : "ALL";
  const query = filters?.q?.trim() ?? "";
  const sort = tagSortOptions.has((filters?.sort ?? "recent") as AdminTagSort)
    ? ((filters?.sort ?? "recent") as AdminTagSort)
    : "recent";
  const parsedPage = Number.parseInt(filters?.page ?? "1", 10);

  return {
    category,
    query,
    sort,
    page: Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1,
    pageSize: TAG_BROWSER_PAGE_SIZE,
  };
}

function buildTagOrderBy(sort: AdminTagSort): Prisma.TagOrderByWithRelationInput[] {
  switch (sort) {
    case "usage":
      return [
        {
          photos: {
            _count: "desc",
          },
        },
        {
          updatedAt: "desc",
        },
        {
          name: "asc",
        },
      ];
    case "name":
      return [
        {
          name: "asc",
        },
        {
          updatedAt: "desc",
        },
      ];
    case "recent":
    default:
      return [
        {
          updatedAt: "desc",
        },
        {
          name: "asc",
        },
      ];
  }
}

function buildTagSearchWhere(args: {
  query: string;
  category: string;
}): Prisma.TagWhereInput {
  const slugQuery = normalizeTagSlug(args.query);

  return {
    ...(args.category !== "ALL"
      ? {
          category: args.category as TagCategoryValue,
        }
      : {}),
    ...(args.query
      ? {
          OR: [
            {
              name: {
                contains: args.query,
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
                        contains: args.query,
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

export async function getAdminTagBrowserData(filters?: {
  category?: string | null;
  q?: string | null;
  sort?: string | null;
  page?: string | null;
}) {
  const normalizedFilters = normalizeAdminTagFilters(filters);
  const where = buildTagSearchWhere({
    query: normalizedFilters.query,
    category: normalizedFilters.category,
  });
  const totalCount = await prisma.tag.count({
    where,
  });
  const totalPages = Math.max(
    1,
    Math.ceil(totalCount / normalizedFilters.pageSize),
  );
  const page = Math.min(normalizedFilters.page, totalPages);

  const [tags, categorySummary] = await Promise.all([
    prisma.tag.findMany({
      where,
      orderBy: buildTagOrderBy(normalizedFilters.sort),
      skip: (page - 1) * normalizedFilters.pageSize,
      take: normalizedFilters.pageSize,
      select: {
        id: true,
        name: true,
        slug: true,
        category: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            photos: true,
            aliases: true,
          },
        },
        aliases: {
          orderBy: [{ name: "asc" }],
          take: 3,
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    }),
    prisma.tag.groupBy({
      by: ["category"],
      _count: true,
    }),
  ]);

  return {
    filters: {
      ...normalizedFilters,
      page,
    },
    pagination: {
      page,
      pageSize: normalizedFilters.pageSize,
      totalCount,
      totalPages,
      hasPreviousPage: page > 1,
      hasNextPage: page < totalPages,
    },
    summary: {
      total: categorySummary.reduce((count, row) => count + row._count, 0),
      byCategory: categorySummary.reduce<Record<string, number>>((summary, row) => {
        summary[row.category] = row._count;
        return summary;
      }, {}),
    },
    tags: tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
      category: tag.category,
      createdAt: tag.createdAt,
      updatedAt: tag.updatedAt,
      photoCount: tag._count.photos,
      aliasCount: tag._count.aliases,
      aliases: tag.aliases,
    })),
  };
}

function buildConfusableTagQueries(tag: {
  name: string;
  slug: string;
  aliases: Array<{
    name: string;
    slug: string;
  }>;
}) {
  return [
    tag.name,
    tag.slug.replace(/-/g, " "),
    ...tag.aliases.flatMap((alias) => [alias.name, alias.slug.replace(/-/g, " ")]),
  ]
    .map((value) => normalizeTagName(value))
    .filter((value) => value.length >= 2)
    .slice(0, 5);
}

export async function getAdminTagDetailData(tagId: string) {
  const tag = await prisma.tag.findUnique({
    where: {
      id: tagId,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      category: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          photos: true,
          aliases: true,
        },
      },
      aliases: {
        orderBy: [{ name: "asc" }],
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!tag) {
    return null;
  }

  const [samplePhotos, linkedPhotoRows, confusableCandidates] = await Promise.all([
    prisma.photo.findMany({
      where: {
        tags: {
          some: {
            tagId,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 12,
      include: {
        event: {
          select: {
            id: true,
            title: true,
            slug: true,
            eventDate: true,
            coverOriginalKey: true,
          },
        },
        derivatives: {
          orderBy: [{ width: "desc" }],
        },
      },
    }),
    prisma.photo.findMany({
      where: {
        tags: {
          some: {
            tagId,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 120,
      select: {
        id: true,
        event: {
          select: {
            id: true,
            title: true,
            slug: true,
            eventDate: true,
          },
        },
      },
    }),
    Promise.all(
      buildConfusableTagQueries(tag).map((query) =>
        searchAdminTags({
          query,
          category: tag.category,
          excludeTagId: tag.id,
          limit: 8,
        }),
      ),
    ),
  ]);

  const linkedEvents = [...new Map(
    linkedPhotoRows.map((photo) => [
      photo.event.id,
      {
        id: photo.event.id,
        title: photo.event.title,
        slug: photo.event.slug,
        eventDate: photo.event.eventDate,
      },
    ]),
  ).values()];

  const confusableTags = [...new Map(
    confusableCandidates
      .flat()
      .map((candidate) => [
        candidate.id,
        {
          id: candidate.id,
          name: candidate.name,
          slug: candidate.slug,
          category: candidate.category,
          photoCount: candidate.photoCount,
          aliasCount: candidate.aliasCount,
          matchedAliases: candidate.matchedAliases,
        },
      ]),
  ).values()]
    .sort((left, right) => {
      if (left.photoCount !== right.photoCount) {
        return right.photoCount - left.photoCount;
      }

      return left.name.localeCompare(right.name);
    })
    .slice(0, 8);

  return {
    tag: {
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
      category: tag.category,
      createdAt: tag.createdAt,
      updatedAt: tag.updatedAt,
      photoCount: tag._count.photos,
      aliasCount: tag._count.aliases,
      aliases: tag.aliases,
    },
    examplePhotos: samplePhotos.map((photo) => {
      const preview = pickDerivative(photo.derivatives, ["GRID", "THUMBNAIL", "VIEWER"]);
      const effectiveTakenAt = getEffectiveTakenAt(photo);

      return {
        id: photo.id,
        originalFilename: photo.originalFilename,
        caption: photo.caption,
        altText: photo.altText,
        previewUrl: buildDisplayUrl(preview?.storageKey),
        previewWidth: preview?.width ?? photo.width ?? 1200,
        previewHeight: preview?.height ?? photo.height ?? 1500,
        effectiveTakenAt,
        createdAt: photo.createdAt,
        event: photo.event,
        isCover: photo.event.coverOriginalKey === photo.originalKey,
      };
    }),
    linkedEvents,
    confusableTags,
  };
}

async function findTagIdentifierConflict(
  tx: Prisma.TransactionClient,
  args: {
    category: TagCategoryValue;
    slug: string;
    ignoreTagIds?: string[];
  },
) {
  const ignoredTagIds = [...new Set((args.ignoreTagIds ?? []).filter(Boolean))];

  const canonicalConflict = await tx.tag.findFirst({
    where: {
      category: args.category,
      slug: args.slug,
      ...(ignoredTagIds.length
        ? {
            id: {
              notIn: ignoredTagIds,
            },
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      category: true,
    },
  });

  if (canonicalConflict) {
    return {
      type: "canonical",
      tag: canonicalConflict,
    } satisfies TagConflict;
  }

  const aliasConflict = await tx.tagAlias.findFirst({
    where: {
      category: args.category,
      slug: args.slug,
      ...(ignoredTagIds.length
        ? {
            tagId: {
              notIn: ignoredTagIds,
            },
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      tag: {
        select: {
          id: true,
          name: true,
          slug: true,
          category: true,
        },
      },
    },
  });

  if (!aliasConflict) {
    return null;
  }

  return {
    type: "alias",
    tag: aliasConflict.tag,
    alias: {
      id: aliasConflict.id,
      name: aliasConflict.name,
      slug: aliasConflict.slug,
    },
  } satisfies TagConflict;
}

async function upsertAliasOnTag(
  tx: Prisma.TransactionClient,
  args: {
    tagId: string;
    category: TagCategoryValue;
    canonicalSlug: string;
    name: string;
    slug?: string;
    ignoreTagIds?: string[];
    onConflict?: "throw" | "skip";
  },
) {
  const name = normalizeTagName(args.name);
  const slug = normalizeTagSlug(args.slug ?? args.name);

  if (!name || !slug || slug === args.canonicalSlug) {
    return null;
  }

  const existingOnTag = await tx.tagAlias.findFirst({
    where: {
      tagId: args.tagId,
      category: args.category,
      slug,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (existingOnTag) {
    if (existingOnTag.name !== name) {
      return tx.tagAlias.update({
        where: {
          id: existingOnTag.id,
        },
        data: {
          name,
        },
      });
    }

    return existingOnTag;
  }

  const conflict = await findTagIdentifierConflict(tx, {
    category: args.category,
    slug,
    ignoreTagIds: [args.tagId, ...(args.ignoreTagIds ?? [])],
  });

  if (conflict) {
    if (args.onConflict === "skip") {
      return null;
    }

    throw new Error(
      `Alias ${slug} already points to ${conflict.tag.name}. Remove or merge that tag first.`,
    );
  }

  return tx.tagAlias.create({
    data: {
      tagId: args.tagId,
      category: args.category,
      name,
      slug,
    },
  });
}

export async function renameTag(args: {
  tagId: string;
  name: string;
  slug?: string | null;
}) {
  const nextName = normalizeTagName(args.name);
  const nextSlug = normalizeTagSlug(args.slug ?? args.name);

  if (!nextName || !nextSlug) {
    throw new Error("Name and slug are required.");
  }

  return prisma.$transaction(async (tx) => {
    const current = await tx.tag.findUnique({
      where: {
        id: args.tagId,
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
    });

    if (!current) {
      throw new Error("Tag not found.");
    }

    const conflict = await findTagIdentifierConflict(tx, {
      category: current.category,
      slug: nextSlug,
      ignoreTagIds: [current.id],
    });

    if (conflict) {
      throw new Error(
        `Slug ${nextSlug} already resolves to ${conflict.tag.name}. Merge into that tag or choose a different slug.`,
      );
    }

    await tx.tagAlias.deleteMany({
      where: {
        tagId: current.id,
        category: current.category,
        slug: nextSlug,
      },
    });

    const updated = await tx.tag.update({
      where: {
        id: current.id,
      },
      data: {
        name: nextName,
        slug: nextSlug,
      },
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
      },
    });

    if (current.name !== nextName || current.slug !== nextSlug) {
      await upsertAliasOnTag(tx, {
        tagId: current.id,
        category: current.category,
        canonicalSlug: nextSlug,
        name: current.name,
        slug: current.slug,
        ignoreTagIds: [current.id],
        onConflict: "skip",
      });
    }

    return {
      tag: updated,
      previous: current,
    };
  });
}

export async function addTagAlias(args: {
  tagId: string;
  name: string;
  slug?: string | null;
}) {
  const name = normalizeTagName(args.name);
  const slug = normalizeTagSlug(args.slug ?? args.name);

  if (!name || !slug) {
    throw new Error("Alias name and slug are required.");
  }

  return prisma.$transaction(async (tx) => {
    const tag = await tx.tag.findUnique({
      where: {
        id: args.tagId,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        category: true,
      },
    });

    if (!tag) {
      throw new Error("Tag not found.");
    }

    if (slug === tag.slug) {
      throw new Error("That alias already matches the canonical slug.");
    }

    const alias = await upsertAliasOnTag(tx, {
      tagId: tag.id,
      category: tag.category,
      canonicalSlug: tag.slug,
      name,
      slug,
      onConflict: "throw",
    });

    await tx.tag.update({
      where: {
        id: tag.id,
      },
      data: {
        updatedAt: new Date(),
      },
    });

    return {
      tag,
      alias,
    };
  });
}

export async function removeTagAlias(args: {
  tagId: string;
  aliasId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const deleted = await tx.tagAlias.deleteMany({
      where: {
        id: args.aliasId,
        tagId: args.tagId,
      },
    });

    if (!deleted.count) {
      throw new Error("Alias not found.");
    }

    await tx.tag.update({
      where: {
        id: args.tagId,
      },
      data: {
        updatedAt: new Date(),
      },
    });
  });
}

export async function mergeTags(args: {
  sourceTagId: string;
  destinationTagId: string;
}) {
  if (args.sourceTagId === args.destinationTagId) {
    throw new Error("Choose a different destination tag.");
  }

  return prisma.$transaction(async (tx) => {
    const [source, destination] = await Promise.all([
      tx.tag.findUnique({
        where: {
          id: args.sourceTagId,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          category: true,
          aliases: {
            orderBy: [{ name: "asc" }],
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          _count: {
            select: {
              photos: true,
              aliases: true,
            },
          },
        },
      }),
      tx.tag.findUnique({
        where: {
          id: args.destinationTagId,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          category: true,
          _count: {
            select: {
              photos: true,
              aliases: true,
            },
          },
        },
      }),
    ]);

    if (!source || !destination) {
      throw new Error("Source or destination tag no longer exists.");
    }

    if (source.category !== destination.category) {
      throw new Error("Only tags in the same category can be merged.");
    }

    const sourcePhotoLinks = await tx.photoTag.findMany({
      where: {
        tagId: source.id,
      },
      select: {
        photoId: true,
      },
    });

    if (sourcePhotoLinks.length) {
      await tx.photoTag.createMany({
        data: sourcePhotoLinks.map((link) => ({
          photoId: link.photoId,
          tagId: destination.id,
        })),
        skipDuplicates: true,
      });
    }

    await tx.photoTag.deleteMany({
      where: {
        tagId: source.id,
      },
    });

    const aliasCandidates = [
      {
        name: source.name,
        slug: source.slug,
      },
      ...source.aliases.map((alias) => ({
        name: alias.name,
        slug: alias.slug,
      })),
    ];

    await tx.tagAlias.deleteMany({
      where: {
        tagId: source.id,
      },
    });

    for (const candidate of aliasCandidates) {
      await upsertAliasOnTag(tx, {
        tagId: destination.id,
        category: destination.category,
        canonicalSlug: destination.slug,
        name: candidate.name,
        slug: candidate.slug,
        ignoreTagIds: [source.id],
        onConflict: "skip",
      });
    }

    await tx.tag.delete({
      where: {
        id: source.id,
      },
    });

    await tx.tag.update({
      where: {
        id: destination.id,
      },
      data: {
        updatedAt: new Date(),
      },
    });

    return {
      source,
      destination,
      movedPhotoCount: sourcePhotoLinks.length,
    };
  });
}
