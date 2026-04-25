import "server-only";

import sharp from "sharp";

import { Prisma } from "../../../prisma/generated/client/client";
import {
  loadFurtrackImageBuffer,
  loadFurtrackPost,
  loadFurtrackPostIdsByTag,
  loadFurtrackPostIdsByTagPage,
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
  averageHash: string;
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

type EventForCandidateTags = {
  title: string;
  slug: string;
  kicker: string | null;
  eventDate: Date;
  eventEndDate: Date | null;
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

type FurtrackMatchRunStage = "discover" | "local" | "candidates" | "finalize" | "complete";

type SerializedLocalPhotoRef = LocalPhotoForMatch;

type SerializedLocalPhoto = {
  photo: SerializedLocalPhotoRef;
  previewUrl: string | null;
  fingerprint: ImageFingerprint;
};

type SerializedCandidate = {
  post: FurtrackPostForMatch;
  fingerprint: ImageFingerprint;
};

type FurtrackPostForMatch = Pick<
  FurtrackPostDetail,
  "post" | "tags" | "externalUrl" | "imageUrl"
>;

type FurtrackMatchRunPayload = {
  kind: "furtrack-match-run";
  version: 1;
  stage: FurtrackMatchRunStage;
  event: {
    id: string;
    title: string;
    slug: string;
  };
  request: {
    eventId: string;
    tags: string[];
    explicitPostIds: string[];
    candidateTags: string[];
    pagesPerTag: number;
    maxCandidates: number;
    maxPhotos: number;
    minScore: number;
  };
  progress: {
    current: number;
    total: number;
    label: string;
  };
  discovery: {
    tagIndex: number;
    page: number;
    candidateIndex: number;
    postIds: string[];
  };
  localRefs: SerializedLocalPhotoRef[];
  locals: SerializedLocalPhoto[];
  candidates: SerializedCandidate[];
  errors: CandidateError[];
  result?: FurtrackEventMatchTestResult;
};

export type FurtrackMatchRunSummary = {
  id: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
  errorMessage: string | null;
  stage: FurtrackMatchRunStage | null;
  progress: FurtrackMatchRunPayload["progress"] | null;
  result: FurtrackEventMatchTestResult | null;
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

function normalizeFurtrackTagValue(value: string, options?: { lowerCase?: boolean }) {
  const normalized = value
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return options?.lowerCase === false ? normalized : normalized.toLowerCase();
}

function buildEventTagSeeds(event: EventForCandidateTags) {
  const years = [
    event.eventDate.getUTCFullYear(),
    event.eventEndDate?.getUTCFullYear(),
  ]
    .filter((year): year is number => Boolean(year))
    .map(String);
  const textSeeds = [
    event.kicker,
    event.title,
    event.slug,
    event.kicker && years[0] ? `${event.kicker} ${years[0]}` : null,
    event.title && years[0] ? `${event.title} ${years[0]}` : null,
  ].filter((value): value is string => Boolean(value?.trim()));
  const normalized = new Set<string>();

  for (const seed of textSeeds) {
    const values = [
      normalizeFurtrackTagValue(seed, { lowerCase: false }),
      normalizeFurtrackTagValue(seed),
    ];

    for (const value of values) {
      if (!value || value.length < 2) {
        continue;
      }

      normalized.add(value);

      for (const year of years) {
        if (!value.includes(year)) {
          normalized.add(`${value}_${year}`);
        }
      }

      const withoutYear = value.replace(/_?(20\d{2})$/, "");
      if (withoutYear && withoutYear !== value) {
        normalized.add(withoutYear);
      }
    }
  }

  return [...normalized].map((value) => `5:${value}`);
}

async function fingerprintImage(buffer: Buffer): Promise<ImageFingerprint> {
  const metadata = await sharp(buffer).rotate().metadata();
  const dHashPixels = await sharp(buffer)
    .rotate()
    .resize(HASH_WIDTH, HASH_HEIGHT, {
      fit: "fill",
    })
    .greyscale()
    .raw()
    .toBuffer();
  const averagePixels = await sharp(buffer)
    .rotate()
    .resize(8, 8, {
      fit: "fill",
    })
    .greyscale()
    .raw()
    .toBuffer();

  let hash = 0n;

  for (let row = 0; row < HASH_HEIGHT; row += 1) {
    for (let column = 0; column < HASH_WIDTH - 1; column += 1) {
      const left = dHashPixels[row * HASH_WIDTH + column] ?? 0;
      const right = dHashPixels[row * HASH_WIDTH + column + 1] ?? 0;
      hash = (hash << 1n) | (left > right ? 1n : 0n);
    }
  }

  const average =
    averagePixels.reduce((sum, value) => sum + value, 0) / averagePixels.length;
  let averageHash = 0n;

  for (const pixel of averagePixels) {
    averageHash = (averageHash << 1n) | (pixel >= average ? 1n : 0n);
  }

  return {
    hash: bigintToHash(hash),
    averageHash: bigintToHash(averageHash),
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
  return loadFurtrackImageBuffer(url);
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
  const errors: CandidateError[] = [];

  for (const tag of args.tags) {
    if (postIds.size >= args.maxCandidates) {
      break;
    }

    let tagPostIds: string[];

    try {
      tagPostIds = await loadFurtrackPostIdsByTag({
        tag,
        pages: args.pagesPerTag,
        maxPosts: args.maxCandidates - postIds.size,
      });
    } catch (error) {
      errors.push({
        postId: `tag:${tag}`,
        error: error instanceof Error ? error.message : "Candidate tag failed.",
      });
      continue;
    }

    for (const postId of tagPostIds) {
      postIds.add(postId);

      if (postIds.size >= args.maxCandidates) {
        break;
      }
    }
  }

  return {
    postIds: [...postIds].slice(0, args.maxCandidates),
    errors,
  };
}

function toMatch(args: {
  localFingerprint: ImageFingerprint;
  post: FurtrackPostForMatch;
  candidateFingerprint: ImageFingerprint;
}) {
  const hamming = hammingDistance(
    args.localFingerprint.hash,
    args.candidateFingerprint.hash,
  );
  const averageHamming = hammingDistance(
    args.localFingerprint.averageHash,
    args.candidateFingerprint.averageHash,
  );
  const dHashSimilarity = 1 - hamming / HASH_BITS;
  const averageHashSimilarity = 1 - averageHamming / HASH_BITS;
  const visualSimilarity = Math.max(
    dHashSimilarity,
    dHashSimilarity * 0.7 + averageHashSimilarity * 0.3,
  );
  const aspectScore = aspectRatioScore(args.localFingerprint, {
    width: args.post.post.metaWidth ?? args.candidateFingerprint.width,
    height: args.post.post.metaHeight ?? args.candidateFingerprint.height,
  });
  const score = visualSimilarity * 0.97 + aspectScore * 0.03;

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
    500,
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

  const [{ buffer, previewUrl }, candidatesResult] = await Promise.all([
    loadLocalPhotoImage(photo),
    resolveCandidatePostIds({
      tags,
      postIds: explicitPostIds,
      pagesPerTag: Math.min(Math.max(args.pagesPerTag ?? 1, 1), 10),
      maxCandidates,
    }),
  ]);
  const candidatePostIds = candidatesResult.postIds;
  const localFingerprint = await fingerprintImage(buffer);
  const matches: FurtrackVisualMatch[] = [];
  const errors: CandidateError[] = [...candidatesResult.errors];

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
    2000,
  );
  const maxPhotos = Math.min(Math.max(args.maxPhotos ?? 80, 1), 500);
  const minScore = args.minScore ?? 0.74;

  const event = await prisma.event.findUnique({
    where: {
      id: args.eventId,
    },
    select: {
      id: true,
      title: true,
      slug: true,
      kicker: true,
      eventDate: true,
      eventEndDate: true,
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

  const candidateTags = tags.length ? tags : buildEventTagSeeds(event);

  if (!candidateTags.length && !explicitPostIds.length) {
    throw new Error("No Furtrack candidate tags could be derived for this event.");
  }

  const candidatesResult = await resolveCandidatePostIds({
    tags: candidateTags,
    postIds: explicitPostIds,
    pagesPerTag: Math.min(Math.max(args.pagesPerTag ?? 1, 1), 10),
    maxCandidates,
  });
  const candidatePostIds = candidatesResult.postIds;
  const errors: CandidateError[] = [...candidatesResult.errors];
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
      tags: candidateTags,
      explicitPostIds,
      totalCandidates: candidatePostIds.length,
      localPhotoCount: localPhotos.length,
    },
    suggestions,
    unmatchedPhotos,
    errors,
  };
}

function toInputJson(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function asMatchRunPayload(value: unknown): FurtrackMatchRunPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Partial<FurtrackMatchRunPayload>;
  if (candidate.kind !== "furtrack-match-run" || candidate.version !== 1) {
    return null;
  }

  const payload = candidate as FurtrackMatchRunPayload;

  if (typeof payload.discovery.candidateIndex !== "number") {
    payload.discovery.candidateIndex = 0;
  }

  return payload;
}

function summarizeRun(payload: FurtrackMatchRunPayload, job: {
  id: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
  errorMessage: string | null;
}): FurtrackMatchRunSummary {
  return {
    id: job.id,
    status: job.status,
    errorMessage: job.errorMessage,
    stage: payload.stage,
    progress: payload.progress,
    result: payload.result ?? null,
  };
}

async function loadRun(jobId: string) {
  const job = await prisma.importJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      status: true,
      errorMessage: true,
      payloadJson: true,
    },
  });

  if (!job) {
    throw new Error("Furtrack match run not found.");
  }

  const payload = asMatchRunPayload(job.payloadJson);

  if (!payload) {
    throw new Error("Import job is not a Furtrack match run.");
  }

  return {
    job,
    payload,
  };
}

async function saveRunPayload(jobId: string, payload: FurtrackMatchRunPayload) {
  const status =
    payload.stage === "complete"
      ? "SUCCEEDED"
      : payload.errors.length && !payload.discovery.postIds.length && payload.stage === "local"
        ? "FAILED"
        : "RUNNING";

  const updated = await prisma.importJob.update({
    where: { id: jobId },
    data: {
      status,
      payloadJson: toInputJson(payload),
      processedItems: payload.progress.current,
      totalItems: payload.progress.total,
      startedAt: new Date(),
      finishedAt: payload.stage === "complete" ? new Date() : null,
      errorMessage:
        status === "FAILED"
          ? payload.errors.map((error) => error.error).slice(0, 4).join("\n")
          : null,
    },
    select: {
      id: true,
      status: true,
      errorMessage: true,
    },
  });

  return summarizeRun(payload, updated);
}

function buildEventMatchResultFromPayload(
  payload: FurtrackMatchRunPayload,
): FurtrackEventMatchTestResult {
  const perPhotoMatches = payload.locals.map((localPhoto) => {
    const matches = payload.candidates
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
    if (pair.match.score < payload.request.minScore) {
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

  return {
    event: payload.event,
    searched: {
      tags: payload.request.candidateTags,
      explicitPostIds: payload.request.explicitPostIds,
      totalCandidates: payload.candidates.length,
      localPhotoCount: payload.locals.length,
    },
    suggestions,
    unmatchedPhotos: perPhotoMatches
      .filter((entry) => !usedPhotoIds.has(entry.localPhoto.photo.id))
      .map((entry) => ({
        id: entry.localPhoto.photo.id,
        originalFilename: entry.localPhoto.photo.originalFilename,
        previewUrl: entry.localPhoto.previewUrl,
        bestScore: entry.matches[0]?.score ?? null,
      })),
    errors: payload.errors,
  };
}

export async function createFurtrackMatchRun(args: {
  eventId: string;
  tags?: string[];
  postIds?: string[];
  pagesPerTag?: number;
  maxCandidates?: number;
  maxPhotos?: number;
  minScore?: number;
  requestedById?: string;
}) {
  const tags = [...new Set((args.tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
  const explicitPostIds = [
    ...new Set((args.postIds ?? []).map((postId) => postId.trim()).filter(Boolean)),
  ];
  const maxCandidates = Math.min(Math.max(args.maxCandidates ?? 800, 1), 2000);
  const maxPhotos = Math.min(Math.max(args.maxPhotos ?? 250, 1), 500);
  const pagesPerTag = Math.min(Math.max(args.pagesPerTag ?? 5, 1), 10);
  const minScore = args.minScore ?? 0.74;
  const event = await prisma.event.findUnique({
    where: {
      id: args.eventId,
    },
    select: {
      id: true,
      title: true,
      slug: true,
      kicker: true,
      eventDate: true,
      eventEndDate: true,
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

  const candidateTags = tags.length ? tags : buildEventTagSeeds(event);

  if (!candidateTags.length && !explicitPostIds.length) {
    throw new Error("No Furtrack candidate tags could be derived for this event.");
  }

  const initialCandidateTotal = candidateTags.length
    ? maxCandidates
    : explicitPostIds.length;
  const payload: FurtrackMatchRunPayload = {
    kind: "furtrack-match-run",
    version: 1,
    stage: candidateTags.length ? "discover" : "local",
    event: {
      id: event.id,
      title: event.title,
      slug: event.slug,
    },
    request: {
      eventId: event.id,
      tags,
      explicitPostIds,
      candidateTags,
      pagesPerTag,
      maxCandidates,
      maxPhotos,
      minScore,
    },
    progress: {
      current: 0,
      total:
        candidateTags.length * pagesPerTag +
        event.photos.length +
        initialCandidateTotal,
      label: "Starting",
    },
    discovery: {
      tagIndex: 0,
      page: 0,
      candidateIndex: 0,
      postIds: explicitPostIds,
    },
    localRefs: event.photos,
    locals: [],
    candidates: [],
    errors: [],
  };
  const job = await prisma.importJob.create({
    data: {
      type: "FURTRACK_SYNC",
      source: "FURTRACK",
      status: "PENDING",
      eventId: event.id,
      requestedById: args.requestedById,
      payloadJson: toInputJson(payload),
      totalItems: payload.progress.total,
    },
    select: {
      id: true,
      status: true,
      errorMessage: true,
    },
  });

  return summarizeRun(payload, job);
}

export async function getFurtrackMatchRun(jobId: string) {
  const { job, payload } = await loadRun(jobId);
  return summarizeRun(payload, job);
}

const LOCAL_CHUNK_SIZE = 8;
const CANDIDATE_CHUNK_SIZE = 1;

export async function stepFurtrackMatchRun(jobId: string) {
  const { payload } = await loadRun(jobId);

  if (payload.stage === "complete") {
    return saveRunPayload(jobId, payload);
  }

  if (payload.stage === "discover") {
    const tag = payload.request.candidateTags[payload.discovery.tagIndex];

    if (!tag || payload.discovery.postIds.length >= payload.request.maxCandidates) {
      payload.stage = "local";
      payload.progress = {
        current: payload.progress.current,
        total:
          payload.progress.current +
          payload.localRefs.length +
          Math.min(payload.discovery.postIds.length, payload.request.maxCandidates),
        label: "Preparing local photos",
      };
      return saveRunPayload(jobId, payload);
    }

    try {
      const pagePostIds = await loadFurtrackPostIdsByTagPage({
        tag,
        page: payload.discovery.page,
        maxPosts: payload.request.maxCandidates - payload.discovery.postIds.length,
      });

      for (const postId of pagePostIds) {
        if (!payload.discovery.postIds.includes(postId)) {
          payload.discovery.postIds.push(postId);
        }
      }
    } catch (error) {
      payload.errors.push({
        postId: `tag:${tag}:${payload.discovery.page}`,
        error: error instanceof Error ? error.message : "Candidate page failed.",
      });
    }

    payload.discovery.page += 1;
    payload.progress = {
      current: payload.progress.current + 1,
      total: payload.progress.total,
      label: `Scanning Furtrack ${tag} page ${payload.discovery.page}`,
    };

    if (payload.discovery.page >= payload.request.pagesPerTag) {
      payload.discovery.page = 0;
      payload.discovery.tagIndex += 1;
    }

    return saveRunPayload(jobId, payload);
  }

  if (payload.stage === "local") {
    const start = payload.locals.length;
    const next = payload.localRefs.slice(start, start + LOCAL_CHUNK_SIZE);

    for (const photo of next) {
      try {
        const { buffer, previewUrl } = await loadLocalPhotoImage(photo);
        payload.locals.push({
          photo,
          previewUrl,
          fingerprint: await fingerprintImage(buffer),
        });
      } catch (error) {
        payload.errors.push({
          postId: `local:${photo.id}`,
          error: error instanceof Error ? error.message : "Local photo failed.",
        });
      }
    }

    payload.progress = {
      current: payload.progress.current + next.length,
      total: payload.progress.total,
      label: `Prepared ${payload.locals.length}/${payload.localRefs.length} local photos`,
    };

    if (payload.locals.length >= payload.localRefs.length) {
      payload.discovery.postIds = payload.discovery.postIds.slice(
        0,
        payload.request.maxCandidates,
      );
      payload.stage = "candidates";
    }

    return saveRunPayload(jobId, payload);
  }

  if (payload.stage === "candidates") {
    const start = payload.discovery.candidateIndex;
    const next = payload.discovery.postIds.slice(start, start + CANDIDATE_CHUNK_SIZE);

    for (const postId of next) {
      try {
        const post = await loadFurtrackPost(postId);
        const candidateBuffer = await loadFurtrackImageBuffer(post.imageUrl);
        payload.candidates.push({
          post: {
            post: post.post,
            tags: post.tags,
            externalUrl: post.externalUrl,
            imageUrl: post.imageUrl,
          },
          fingerprint: await fingerprintImage(candidateBuffer),
        });
      } catch (error) {
        payload.errors.push({
          postId,
          error: error instanceof Error ? error.message : "Candidate failed.",
        });
      }
    }

    payload.discovery.candidateIndex += next.length;

    payload.progress = {
      current: payload.progress.current + next.length,
      total: payload.progress.total,
      label: `Checked ${payload.discovery.candidateIndex}/${payload.discovery.postIds.length} Furtrack candidates`,
    };

    if (payload.discovery.candidateIndex >= payload.discovery.postIds.length) {
      payload.stage = "finalize";
    }

    return saveRunPayload(jobId, payload);
  }

  payload.result = buildEventMatchResultFromPayload(payload);
  payload.stage = "complete";
  payload.progress = {
    current: payload.progress.total,
    total: payload.progress.total,
    label: "Complete",
  };

  return saveRunPayload(jobId, payload);
}
