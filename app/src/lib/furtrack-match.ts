import "server-only";

import sharp from "sharp";

import {
  loadFurtrackPost,
  loadFurtrackPostIdsByTag,
  type FurtrackPostDetail,
} from "@/lib/furtrack";
import { prisma } from "@/lib/prisma";
import { buildDisplayUrl, getStorageBuckets, readObject } from "@/lib/storage";
import { getTagCategoryLabel } from "@/lib/tags";

const HASH_WIDTH = 9;
const HASH_HEIGHT = 8;
const HASH_BITS = 64;
const DEFAULT_MAX_CANDIDATES = 40;

type ImageFingerprint = {
  hash: string;
  width: number | null;
  height: number | null;
};

type CandidateError = {
  postId: string;
  error: string;
};

type LocalPhotoForMatch = {
  id: string;
  originalFilename: string;
  originalKey: string;
  width: number | null;
  height: number | null;
  event: {
    id: string;
    title: string;
    slug: string;
  };
  derivatives: Array<{
    kind: string;
    width: number;
    height: number;
    storageKey: string;
  }>;
};

export type FurtrackVisualMatch = {
  postId: string;
  externalUrl: string;
  imageUrl: string;
  score: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  visualSimilarity: number;
  hammingDistance: number;
  aspectScore: number;
  localHash: string;
  furtrackHash: string;
  dimensions: {
    local: {
      width: number | null;
      height: number | null;
    };
    furtrack: {
      width: number | null;
      height: number | null;
    };
  };
  tags: Array<{
    category: string;
    name: string;
    rawValues: string[];
  }>;
};

export type FurtrackMatchTestResult = {
  localPhoto: {
    id: string;
    originalFilename: string;
    previewUrl: string | null;
    event: {
      id: string;
      title: string;
      slug: string;
    };
    hash: string;
    dimensions: {
      width: number | null;
      height: number | null;
    };
  };
  searched: {
    tags: string[];
    explicitPostIds: string[];
    totalCandidates: number;
  };
  matches: FurtrackVisualMatch[];
  errors: CandidateError[];
};

export type FurtrackEventMatchSuggestion = {
  localPhoto: {
    id: string;
    originalFilename: string;
    previewUrl: string | null;
    event: {
      id: string;
      title: string;
      slug: string;
    };
    hash: string;
    dimensions: {
      width: number | null;
      height: number | null;
    };
  };
  bestMatch: FurtrackVisualMatch;
  alternatives: FurtrackVisualMatch[];
};

export type FurtrackEventMatchTestResult = {
  event: {
    id: string;
    title: string;
    slug: string;
  };
  searched: {
    tags: string[];
    explicitPostIds: string[];
    totalCandidates: number;
    localPhotoCount: number;
  };
  suggestions: FurtrackEventMatchSuggestion[];
  unmatchedPhotos: Array<{
    id: string;
    originalFilename: string;
    previewUrl: string | null;
    bestScore: number | null;
  }>;
  errors: CandidateError[];
};

function pickLocalDerivative(derivatives: LocalPhotoForMatch["derivatives"]) {
  for (const kind of ["VIEWER", "GRID", "THUMBNAIL"]) {
    const match = derivatives
      .filter((derivative) => derivative.kind === kind)
      .sort((left, right) => right.width - left.width)[0];

    if (match) {
      return match;
    }
  }

  return [...derivatives].sort((left, right) => right.width - left.width)[0] ?? null;
}

function bigintToHash(value: bigint) {
  return value.toString(16).padStart(16, "0");
}

function hashToBigint(hash: string) {
  return BigInt(`0x${hash}`);
}

function hammingDistance(left: string, right: string) {
  let value = hashToBigint(left) ^ hashToBigint(right);
  let count = 0;

  while (value > 0n) {
    count += Number(value & 1n);
    value >>= 1n;
  }

  return count;
}

function aspectRatioScore(
  left: { width: number | null; height: number | null },
  right: { width: number | null; height: number | null },
) {
  if (!left.width || !left.height || !right.width || !right.height) {
    return 0.5;
  }

  const leftRatio = left.width / left.height;
  const rightRatio = right.width / right.height;
  const delta = Math.abs(leftRatio - rightRatio) / Math.max(leftRatio, rightRatio);

  return Math.max(0, 1 - delta);
}

function confidenceForScore(score: number): FurtrackVisualMatch["confidence"] {
  if (score >= 0.92) {
    return "HIGH";
  }

  if (score >= 0.82) {
    return "MEDIUM";
  }

  return "LOW";
}

async function fingerprintImage(buffer: Buffer): Promise<ImageFingerprint> {
  const metadata = await sharp(buffer).rotate().metadata();
  const pixels = await sharp(buffer)
    .rotate()
    .resize(HASH_WIDTH, HASH_HEIGHT, {
      fit: "fill",
    })
    .greyscale()
    .raw()
    .toBuffer();

  let hash = 0n;

  for (let row = 0; row < HASH_HEIGHT; row += 1) {
    for (let column = 0; column < HASH_WIDTH - 1; column += 1) {
      const left = pixels[row * HASH_WIDTH + column] ?? 0;
      const right = pixels[row * HASH_WIDTH + column + 1] ?? 0;
      hash = (hash << 1n) | (left > right ? 1n : 0n);
    }
  }

  return {
    hash: bigintToHash(hash),
    width: metadata.width ?? null,
    height: metadata.height ?? null,
  };
}

async function loadLocalPhotoImage(photo: LocalPhotoForMatch) {
  const buckets = await getStorageBuckets();
  const derivative = pickLocalDerivative(photo.derivatives);
  const object = derivative
    ? await readObject({
        bucket: buckets.derivatives,
        key: derivative.storageKey,
      })
    : await readObject({
        bucket: buckets.originals,
        key: photo.originalKey,
      });

  return {
    buffer: object.body,
    previewUrl: buildDisplayUrl(derivative?.storageKey),
  };
}

async function fetchFurtrackImage(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      Referer: "https://www.furtrack.com/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 benfolio-furtrack-match/0.1",
    },
  });

  if (!response.ok) {
    throw new Error(`image fetch returned HTTP ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function fingerprintFurtrackCandidate(postId: string) {
  const post = await loadFurtrackPost(postId);
  const candidateBuffer = await fetchFurtrackImage(post.imageUrl);
  const candidateFingerprint = await fingerprintImage(candidateBuffer);

  return {
    post,
    fingerprint: candidateFingerprint,
  };
}

async function resolveCandidatePostIds(args: {
  tags: string[];
  postIds: string[];
  pagesPerTag: number;
  maxCandidates: number;
}) {
  const postIds = new Set(args.postIds.map((postId) => postId.trim()).filter(Boolean));

  for (const tag of args.tags) {
    if (postIds.size >= args.maxCandidates) {
      break;
    }

    const tagPostIds = await loadFurtrackPostIdsByTag({
      tag,
      pages: args.pagesPerTag,
      maxPosts: args.maxCandidates - postIds.size,
    });

    for (const postId of tagPostIds) {
      postIds.add(postId);

      if (postIds.size >= args.maxCandidates) {
        break;
      }
    }
  }

  return [...postIds].slice(0, args.maxCandidates);
}

function toMatch(args: {
  localFingerprint: ImageFingerprint;
  post: FurtrackPostDetail;
  candidateFingerprint: ImageFingerprint;
}) {
  const hamming = hammingDistance(
    args.localFingerprint.hash,
    args.candidateFingerprint.hash,
  );
  const visualSimilarity = 1 - hamming / HASH_BITS;
  const aspectScore = aspectRatioScore(args.localFingerprint, {
    width: args.post.post.metaWidth ?? args.candidateFingerprint.width,
    height: args.post.post.metaHeight ?? args.candidateFingerprint.height,
  });
  const score = visualSimilarity * 0.9 + aspectScore * 0.1;

  return {
    postId: args.post.post.postId,
    externalUrl: args.post.externalUrl,
    imageUrl: args.post.imageUrl,
    score,
    confidence: confidenceForScore(score),
    visualSimilarity,
    hammingDistance: hamming,
    aspectScore,
    localHash: args.localFingerprint.hash,
    furtrackHash: args.candidateFingerprint.hash,
    dimensions: {
      local: {
        width: args.localFingerprint.width,
        height: args.localFingerprint.height,
      },
      furtrack: {
        width: args.post.post.metaWidth ?? args.candidateFingerprint.width,
        height: args.post.post.metaHeight ?? args.candidateFingerprint.height,
      },
    },
    tags: args.post.tags.map((tag) => ({
      category: getTagCategoryLabel(tag.category),
      name: tag.name,
      rawValues: tag.rawValues,
    })),
  } satisfies FurtrackVisualMatch;
}

export async function testFurtrackMatchesForPhoto(args: {
  photoId: string;
  tags?: string[];
  postIds?: string[];
  pagesPerTag?: number;
  maxCandidates?: number;
  minScore?: number;
}): Promise<FurtrackMatchTestResult> {
  const tags = [...new Set((args.tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
  const explicitPostIds = [
    ...new Set((args.postIds ?? []).map((postId) => postId.trim()).filter(Boolean)),
  ];
  const maxCandidates = Math.min(
    Math.max(args.maxCandidates ?? DEFAULT_MAX_CANDIDATES, 1),
    120,
  );

  if (!tags.length && !explicitPostIds.length) {
    throw new Error("Provide at least one Furtrack tag or post ID to search.");
  }

  const photo = await prisma.photo.findUnique({
    where: {
      id: args.photoId,
    },
    select: {
      id: true,
      originalFilename: true,
      originalKey: true,
      width: true,
      height: true,
      event: {
        select: {
          id: true,
          title: true,
          slug: true,
        },
      },
      derivatives: {
        orderBy: {
          width: "desc",
        },
        select: {
          kind: true,
          width: true,
          height: true,
          storageKey: true,
        },
      },
    },
  });

  if (!photo) {
    throw new Error("Photo not found.");
  }

  const [{ buffer, previewUrl }, candidatePostIds] = await Promise.all([
    loadLocalPhotoImage(photo),
    resolveCandidatePostIds({
      tags,
      postIds: explicitPostIds,
      pagesPerTag: Math.min(Math.max(args.pagesPerTag ?? 1, 1), 5),
      maxCandidates,
    }),
  ]);
  const localFingerprint = await fingerprintImage(buffer);
  const matches: FurtrackVisualMatch[] = [];
  const errors: CandidateError[] = [];

  for (const postId of candidatePostIds) {
    try {
      const candidate = await fingerprintFurtrackCandidate(postId);
      const match = toMatch({
        localFingerprint,
        post: candidate.post,
        candidateFingerprint: candidate.fingerprint,
      });

      if (match.score >= (args.minScore ?? 0)) {
        matches.push(match);
      }
    } catch (error) {
      errors.push({
        postId,
        error: error instanceof Error ? error.message : "Candidate failed.",
      });
    }
  }

  matches.sort((left, right) => right.score - left.score);

  return {
    localPhoto: {
      id: photo.id,
      originalFilename: photo.originalFilename,
      previewUrl,
      event: photo.event,
      hash: localFingerprint.hash,
      dimensions: {
        width: localFingerprint.width ?? photo.width,
        height: localFingerprint.height ?? photo.height,
      },
    },
    searched: {
      tags,
      explicitPostIds,
      totalCandidates: candidatePostIds.length,
    },
    matches,
    errors,
  };
}

export async function testFurtrackMatchesForEvent(args: {
  eventId: string;
  tags?: string[];
  postIds?: string[];
  pagesPerTag?: number;
  maxCandidates?: number;
  maxPhotos?: number;
  minScore?: number;
}): Promise<FurtrackEventMatchTestResult> {
  const tags = [...new Set((args.tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
  const explicitPostIds = [
    ...new Set((args.postIds ?? []).map((postId) => postId.trim()).filter(Boolean)),
  ];
  const maxCandidates = Math.min(
    Math.max(args.maxCandidates ?? DEFAULT_MAX_CANDIDATES, 1),
    200,
  );
  const maxPhotos = Math.min(Math.max(args.maxPhotos ?? 80, 1), 200);
  const minScore = args.minScore ?? 0.82;

  if (!tags.length && !explicitPostIds.length) {
    throw new Error("Provide at least one Furtrack tag or post ID to search.");
  }

  const event = await prisma.event.findUnique({
    where: {
      id: args.eventId,
    },
    select: {
      id: true,
      title: true,
      slug: true,
      photos: {
        where: {
          processingState: "READY",
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        take: maxPhotos,
        select: {
          id: true,
          originalFilename: true,
          originalKey: true,
          width: true,
          height: true,
          event: {
            select: {
              id: true,
              title: true,
              slug: true,
            },
          },
          derivatives: {
            orderBy: {
              width: "desc",
            },
            select: {
              kind: true,
              width: true,
              height: true,
              storageKey: true,
            },
          },
        },
      },
    },
  });

  if (!event) {
    throw new Error("Event not found.");
  }

  const candidatePostIds = await resolveCandidatePostIds({
    tags,
    postIds: explicitPostIds,
    pagesPerTag: Math.min(Math.max(args.pagesPerTag ?? 1, 1), 5),
    maxCandidates,
  });
  const errors: CandidateError[] = [];
  const candidates: Array<{
    post: FurtrackPostDetail;
    fingerprint: ImageFingerprint;
  }> = [];

  for (const postId of candidatePostIds) {
    try {
      candidates.push(await fingerprintFurtrackCandidate(postId));
    } catch (error) {
      errors.push({
        postId,
        error: error instanceof Error ? error.message : "Candidate failed.",
      });
    }
  }

  const localPhotos: Array<{
    photo: LocalPhotoForMatch;
    previewUrl: string | null;
    fingerprint: ImageFingerprint;
  }> = [];

  for (const photo of event.photos) {
    try {
      const { buffer, previewUrl } = await loadLocalPhotoImage(photo);
      localPhotos.push({
        photo,
        previewUrl,
        fingerprint: await fingerprintImage(buffer),
      });
    } catch (error) {
      errors.push({
        postId: `local:${photo.id}`,
        error: error instanceof Error ? error.message : "Local photo failed.",
      });
    }
  }

  const perPhotoMatches = localPhotos.map((localPhoto) => {
    const matches = candidates
      .map((candidate) =>
        toMatch({
          localFingerprint: localPhoto.fingerprint,
          post: candidate.post,
          candidateFingerprint: candidate.fingerprint,
        }),
      )
      .sort((left, right) => right.score - left.score);

    return {
      localPhoto,
      matches,
    };
  });

  const allPairs = perPhotoMatches
    .flatMap((entry) =>
      entry.matches.map((match) => ({
        localPhoto: entry.localPhoto,
        match,
      })),
    )
    .sort((left, right) => right.match.score - left.match.score);
  const usedPhotoIds = new Set<string>();
  const usedPostIds = new Set<string>();
  const suggestions: FurtrackEventMatchSuggestion[] = [];

  for (const pair of allPairs) {
    if (pair.match.score < minScore) {
      break;
    }

    if (
      usedPhotoIds.has(pair.localPhoto.photo.id) ||
      usedPostIds.has(pair.match.postId)
    ) {
      continue;
    }

    usedPhotoIds.add(pair.localPhoto.photo.id);
    usedPostIds.add(pair.match.postId);

    suggestions.push({
      localPhoto: {
        id: pair.localPhoto.photo.id,
        originalFilename: pair.localPhoto.photo.originalFilename,
        previewUrl: pair.localPhoto.previewUrl,
        event: pair.localPhoto.photo.event,
        hash: pair.localPhoto.fingerprint.hash,
        dimensions: {
          width: pair.localPhoto.fingerprint.width ?? pair.localPhoto.photo.width,
          height: pair.localPhoto.fingerprint.height ?? pair.localPhoto.photo.height,
        },
      },
      bestMatch: pair.match,
      alternatives:
        perPhotoMatches
          .find((entry) => entry.localPhoto.photo.id === pair.localPhoto.photo.id)
          ?.matches.filter((match) => match.postId !== pair.match.postId)
          .slice(0, 3) ?? [],
    });
  }

  const unmatchedPhotos = perPhotoMatches
    .filter((entry) => !usedPhotoIds.has(entry.localPhoto.photo.id))
    .map((entry) => ({
      id: entry.localPhoto.photo.id,
      originalFilename: entry.localPhoto.photo.originalFilename,
      previewUrl: entry.localPhoto.previewUrl,
      bestScore: entry.matches[0]?.score ?? null,
    }));

  return {
    event: {
      id: event.id,
      title: event.title,
      slug: event.slug,
    },
    searched: {
      tags,
      explicitPostIds,
      totalCandidates: candidatePostIds.length,
      localPhotoCount: localPhotos.length,
    },
    suggestions,
    unmatchedPhotos,
    errors,
  };
}
