import "server-only";

import type { Prisma } from "../../../prisma/generated/client/client";

import { getResolvedRuntimeSettings } from "@/lib/app-settings";
import { getEffectiveTakenAt } from "@/lib/photo-order";
import { prisma } from "@/lib/prisma";
import { formatDateRange, formatShortDate } from "@/lib/strings";
import { buildDisplayUrl } from "@/lib/storage";
import {
  getTagCategoryLabel,
  normalizeTagName,
  normalizeTagSlug,
  resolveTagSearchCategoryPrefix,
  type TagCategoryValue,
} from "@/lib/tags";

const DEFAULT_RESULT_LIMIT = 12;
// Bumped from 18 to accommodate the dedicated /search results page,
// which loads a richer single-page set than the launcher's quick popup.
const MAX_RESULT_LIMIT = 96;
const MAX_QUERY_TERMS = 6;

type SearchCandidate = {
  id: string;
  title: string | null;
  altText: string | null;
  caption: string | null;
  originalFilename: string;
  createdAt: Date;
  capturedAt: Date | null;
  takenAtOverride: Date | null;
  event: {
    id: string;
    title: string;
    slug: string;
    eventDate: Date;
    eventEndDate: Date | null;
  };
  derivatives: Array<{
    kind: string;
    width: number;
    height: number;
    storageKey: string;
  }>;
  tags: Array<{
    tag: {
      id: string;
      name: string;
      slug: string;
      category: TagCategoryValue;
      aliases: Array<{
        id: string;
        name: string;
        slug: string;
      }>;
    };
  }>;
};

type SearchResultTag = {
  id: string;
  name: string;
  slug: string;
  category: TagCategoryValue;
};

type ParsedTagFilter = {
  category: TagCategoryValue;
  value: string;
  normalizedValue: string;
  slugValue: string;
};

type ParsedSearchQuery = {
  terms: string[];
  tagFilters: ParsedTagFilter[];
};

export type PublicPhotoSearchResult = {
  id: string;
  href: string;
  title: string;
  subtitle: string | null;
  altText: string | null;
  previewUrl: string | null;
  previewWidth: number;
  previewHeight: number;
  event: {
    id: string;
    title: string;
    slug: string;
    href: string;
    eventDateLabel: string;
  };
  effectiveTakenAtLabel: string | null;
  matchedTags: SearchResultTag[];
  matchedTagSummary: string | null;
};

function pickDerivative(
  derivatives: SearchCandidate["derivatives"],
  preferredKinds: Array<"THUMBNAIL" | "GRID" | "VIEWER">,
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

function tokenizeSearchQuery(query: string) {
  return [...new Set(
    normalizeTagName(query)
      .toLowerCase()
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(Boolean),
  )].slice(0, MAX_QUERY_TERMS);
}

function parseSearchQuery(query: string): ParsedSearchQuery {
  const tagFilters: ParsedTagFilter[] = [];
  const remainingQuery = query.replace(
    /(^|\s)([a-zA-Z]+):(?:"([^"]+)"|'([^']+)'|([^\s]+))/g,
    (match, leading: string, prefix: string, quotedValue?: string, singleQuotedValue?: string, bareValue?: string) => {
      const category = resolveTagSearchCategoryPrefix(prefix);
      const value = normalizeTagName(quotedValue ?? singleQuotedValue ?? bareValue ?? "");

      if (!category || !value) {
        return match;
      }

      tagFilters.push({
        category,
        value,
        normalizedValue: value.toLowerCase(),
        slugValue: normalizeTagSlug(value).toLowerCase(),
      });

      return leading;
    },
  );

  return {
    terms: tokenizeSearchQuery(remainingQuery),
    tagFilters: tagFilters.slice(0, MAX_QUERY_TERMS),
  };
}

function buildYearClauses(term: string): Prisma.PhotoWhereInput[] {
  if (!/^\d{4}$/.test(term)) {
    return [];
  }

  const year = Number.parseInt(term, 10);
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));

  return [
    {
      event: {
        is: {
          OR: [
            {
              eventDate: {
                gte: start,
                lt: end,
              },
            },
            {
              eventEndDate: {
                gte: start,
                lt: end,
              },
            },
          ],
        },
      },
    },
    {
      capturedAt: {
        gte: start,
        lt: end,
      },
    },
    {
      takenAtOverride: {
        gte: start,
        lt: end,
      },
    },
    {
      createdAt: {
        gte: start,
        lt: end,
      },
    },
  ];
}

function buildTagFilterClause(filter: ParsedTagFilter): Prisma.PhotoWhereInput {
  return {
    tags: {
      some: {
        tag: {
          category: filter.category,
          OR: [
            {
              name: {
                contains: filter.value,
                mode: "insensitive",
              },
            },
            {
              slug: {
                contains: filter.slugValue,
                mode: "insensitive",
              },
            },
            {
              aliases: {
                some: {
                  OR: [
                    {
                      name: {
                        contains: filter.value,
                        mode: "insensitive",
                      },
                    },
                    {
                      slug: {
                        contains: filter.slugValue,
                        mode: "insensitive",
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
  };
}

function buildPublicPhotoSearchWhere(parsedQuery: ParsedSearchQuery) {
  const { terms, tagFilters } = parsedQuery;
  const andClauses: Prisma.PhotoWhereInput[] = terms.map((term) => ({
    OR: [
      {
        title: {
          contains: term,
          mode: "insensitive",
        },
      },
      {
        caption: {
          contains: term,
          mode: "insensitive",
        },
      },
      {
        altText: {
          contains: term,
          mode: "insensitive",
        },
      },
      {
        originalFilename: {
          contains: term,
          mode: "insensitive",
        },
      },
      {
        event: {
          is: {
            title: {
              contains: term,
              mode: "insensitive",
            },
          },
        },
      },
      {
        event: {
          is: {
            slug: {
              contains: term,
            },
          },
        },
      },
      {
        tags: {
          some: {
            tag: {
              OR: [
                {
                  name: {
                    contains: term,
                    mode: "insensitive",
                  },
                },
                {
                  slug: {
                    contains: term,
                    mode: "insensitive",
                  },
                },
                {
                  aliases: {
                    some: {
                      OR: [
                        {
                          name: {
                            contains: term,
                            mode: "insensitive",
                          },
                        },
                        {
                          slug: {
                            contains: term,
                            mode: "insensitive",
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
      ...buildYearClauses(term),
    ],
  }));

  return {
    processingState: "READY",
    event: {
      is: {
        visibility: "PUBLIC",
      },
    },
    ...(andClauses.length || tagFilters.length
      ? { AND: [...andClauses, ...tagFilters.map(buildTagFilterClause)] }
      : {}),
  } satisfies Prisma.PhotoWhereInput;
}

function getDateYear(value: Date | null | undefined) {
  return value ? value.getUTCFullYear().toString() : null;
}

function includesNormalized(value: string | null | undefined, term: string) {
  if (!value) {
    return false;
  }

  return value.toLowerCase().includes(term);
}

function equalsNormalized(value: string | null | undefined, term: string) {
  if (!value) {
    return false;
  }

  return normalizeTagName(value).toLowerCase() === term;
}

function tagMatchesFilter(
  tag: SearchCandidate["tags"][number]["tag"],
  filter: ParsedTagFilter,
) {
  if (tag.category !== filter.category) {
    return false;
  }

  if (
    tag.slug.toLowerCase() === filter.slugValue ||
    equalsNormalized(tag.name, filter.normalizedValue) ||
    includesNormalized(tag.slug, filter.slugValue) ||
    includesNormalized(tag.name, filter.normalizedValue)
  ) {
    return true;
  }

  return tag.aliases.some(
    (alias) =>
      alias.slug.toLowerCase() === filter.slugValue ||
      equalsNormalized(alias.name, filter.normalizedValue) ||
      includesNormalized(alias.slug, filter.slugValue) ||
      includesNormalized(alias.name, filter.normalizedValue),
  );
}

function getMatchedTags(candidate: SearchCandidate, parsedQuery: ParsedSearchQuery) {
  const { terms, tagFilters } = parsedQuery;

  return candidate.tags
    .map((photoTag) => photoTag.tag)
    .filter((tag) =>
      terms.some(
        (term) =>
          tag.slug.toLowerCase() === term ||
          includesNormalized(tag.slug, term) ||
          includesNormalized(tag.name, term) ||
          tag.aliases.some(
            (alias) =>
              alias.slug.toLowerCase() === term ||
              includesNormalized(alias.slug, term) ||
              includesNormalized(alias.name, term),
          ),
      ) || tagFilters.some((filter) => tagMatchesFilter(tag, filter)),
    )
    .slice(0, 4);
}

function getMatchedTagSummary(tags: SearchResultTag[]) {
  if (!tags.length) {
    return null;
  }

  return tags
    .map((tag) => `${getTagCategoryLabel(tag.category)}: ${tag.name}`)
    .join(" · ");
}

function candidateHasExactTagMatch(candidate: SearchCandidate, term: string) {
  return candidate.tags.some(({ tag }) => {
    if (tag.slug.toLowerCase() === term || equalsNormalized(tag.name, term)) {
      return true;
    }

    return tag.aliases.some(
      (alias) => alias.slug.toLowerCase() === term || equalsNormalized(alias.name, term),
    );
  });
}

function candidateHasPartialTagMatch(candidate: SearchCandidate, term: string) {
  return candidate.tags.some(({ tag }) => {
    if (includesNormalized(tag.slug, term) || includesNormalized(tag.name, term)) {
      return true;
    }

    return tag.aliases.some(
      (alias) => includesNormalized(alias.slug, term) || includesNormalized(alias.name, term),
    );
  });
}

function candidateHasExactFilteredTagMatch(
  candidate: SearchCandidate,
  filter: ParsedTagFilter,
) {
  return candidate.tags.some(({ tag }) => {
    if (tag.category !== filter.category) {
      return false;
    }

    if (
      tag.slug.toLowerCase() === filter.slugValue ||
      equalsNormalized(tag.name, filter.normalizedValue)
    ) {
      return true;
    }

    return tag.aliases.some(
      (alias) =>
        alias.slug.toLowerCase() === filter.slugValue ||
        equalsNormalized(alias.name, filter.normalizedValue),
    );
  });
}

function candidateHasPartialFilteredTagMatch(
  candidate: SearchCandidate,
  filter: ParsedTagFilter,
) {
  return candidate.tags.some(({ tag }) => tagMatchesFilter(tag, filter));
}

function scoreCandidate(candidate: SearchCandidate, parsedQuery: ParsedSearchQuery) {
  const { terms, tagFilters } = parsedQuery;
  const eventYear = getDateYear(candidate.event.eventDate);
  const eventEndYear = getDateYear(candidate.event.eventEndDate);
  const effectiveTakenAt = getEffectiveTakenAt(candidate);
  const effectiveYear = getDateYear(effectiveTakenAt);
  const matchedTags = getMatchedTags(candidate, parsedQuery);
  let total = 0;

  for (const filter of tagFilters) {
    if (candidateHasExactFilteredTagMatch(candidate, filter)) {
      total += 150;
    } else if (candidateHasPartialFilteredTagMatch(candidate, filter)) {
      total += 116;
    }
  }

  for (const term of terms) {
    let bestScore = 0;

    if (candidateHasExactTagMatch(candidate, term)) {
      bestScore = Math.max(bestScore, 120);
    } else if (candidateHasPartialTagMatch(candidate, term)) {
      bestScore = Math.max(bestScore, 96);
    }

    if (candidate.event.slug.toLowerCase() === term) {
      bestScore = Math.max(bestScore, 92);
    } else if (
      includesNormalized(candidate.event.slug, term) ||
      includesNormalized(candidate.event.title, term)
    ) {
      bestScore = Math.max(bestScore, 72);
    }

    if (term === eventYear || term === eventEndYear || term === effectiveYear) {
      bestScore = Math.max(bestScore, 88);
    }

    if (equalsNormalized(candidate.title, term)) {
      bestScore = Math.max(bestScore, 68);
    } else if (
      includesNormalized(candidate.title, term) ||
      includesNormalized(candidate.caption, term) ||
      includesNormalized(candidate.altText, term)
    ) {
      bestScore = Math.max(bestScore, 48);
    }

    if (includesNormalized(candidate.originalFilename, term)) {
      bestScore = Math.max(bestScore, 24);
    }

    total += bestScore;
  }

  if (matchedTags.length) {
    total += matchedTags.length * 6;
  }

  if (effectiveTakenAt) {
    total += 4;
  }

  return total;
}

function toSearchResult(
  candidate: SearchCandidate,
  parsedQuery: ParsedSearchQuery,
): PublicPhotoSearchResult {
  const preview = pickDerivative(candidate.derivatives, ["THUMBNAIL", "GRID", "VIEWER"]);
  const effectiveTakenAt = getEffectiveTakenAt(candidate);
  const matchedTags = getMatchedTags(candidate, parsedQuery);

  return {
    id: candidate.id,
    href: `/p/${candidate.id}`,
    title: candidate.title ?? candidate.caption ?? candidate.originalFilename,
    subtitle:
      candidate.title && candidate.caption && candidate.caption !== candidate.title
        ? candidate.caption
        : candidate.title
          ? null
          : candidate.caption,
    altText: candidate.altText,
    previewUrl: buildDisplayUrl(preview?.storageKey),
    previewWidth: preview?.width ?? 1200,
    previewHeight: preview?.height ?? 1500,
    event: {
      id: candidate.event.id,
      title: candidate.event.title,
      slug: candidate.event.slug,
      href: `/e/${candidate.event.slug}`,
      eventDateLabel: formatDateRange(
        candidate.event.eventDate,
        candidate.event.eventEndDate,
        "short",
      ),
    },
    effectiveTakenAtLabel: effectiveTakenAt ? formatShortDate(effectiveTakenAt) : null,
    matchedTags,
    matchedTagSummary: getMatchedTagSummary(matchedTags),
  };
}

export async function searchPublicPhotos(args: { query: string; limit?: number }) {
  const runtimeSettings = await getResolvedRuntimeSettings();
  const parsedQuery = parseSearchQuery(args.query);

  if (
    !runtimeSettings.publicSearchEnabled ||
    (!parsedQuery.terms.length && !parsedQuery.tagFilters.length)
  ) {
    return [];
  }

  const limit = Math.min(Math.max(args.limit ?? DEFAULT_RESULT_LIMIT, 1), MAX_RESULT_LIMIT);
  const candidates = await prisma.photo.findMany({
    where: buildPublicPhotoSearchWhere(parsedQuery),
    take: Math.min(limit * 8, 120),
    orderBy: [{ createdAt: "desc" }],
    include: {
      event: {
        select: {
          id: true,
          title: true,
          slug: true,
          eventDate: true,
          eventEndDate: true,
        },
      },
      derivatives: {
        orderBy: {
          width: "desc",
        },
      },
      tags: {
        include: {
          tag: {
            include: {
              aliases: {
                orderBy: [{ name: "asc" }],
              },
            },
          },
        },
      },
    },
  });

  return candidates
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(candidate, parsedQuery),
      effectiveTakenAt: getEffectiveTakenAt(candidate),
    }))
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }

      const leftTime = left.effectiveTakenAt?.getTime() ?? left.candidate.createdAt.getTime();
      const rightTime =
        right.effectiveTakenAt?.getTime() ?? right.candidate.createdAt.getTime();

      return rightTime - leftTime;
    })
    .slice(0, limit)
    .map(({ candidate }) => toSearchResult(candidate, parsedQuery));
}
