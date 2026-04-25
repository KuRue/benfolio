import { spawn } from "node:child_process";

import { Prisma } from "../../prisma/generated/client/client.ts";
import sharp from "sharp";

import { env } from "./env.js";
import { prisma } from "./prisma.js";
import { decryptSecret } from "./secret-box.js";

const FURTRACK_PUBLIC_BASE_URL = "https://www.furtrack.com";
const HASH_WIDTH = 9;
const HASH_HEIGHT = 8;
const HASH_BITS = 64;

type FurtrackCacheSyncPayload = {
  kind: "furtrack-cache-sync";
  version: 1;
  tag: string;
  pages: number;
  maxPosts: number;
  refreshExisting: boolean;
};

type FurtrackRuntimeSettings = {
  authToken: string | null;
  baseUrl: string;
  fetchMode: "auto" | "curl_cffi" | "node";
  curlCffiCommand: string;
  curlCffiScript: string;
  curlCffiImpersonate: string;
};

type FurtrackPostMetadata = {
  postId: string;
  submitUserId: string;
  metaFingerprint: string;
  metaFiletype: string;
  metaWidth: number | null;
  metaHeight: number | null;
};

type ParsedFurtrackTag = {
  category: "CHARACTER" | "EVENT" | "SPECIES" | "MAKER" | "GENERAL";
  slug: string;
  name: string;
  rawValue: string;
};

type FurtrackPostDetail = {
  post: FurtrackPostMetadata;
  tags: ParsedFurtrackTag[];
  externalUrl: string;
  imageUrl: string;
};

type FurtrackBridgeResponse = {
  status?: number;
  bodyText?: string;
  bodyBase64?: string;
  error?: string;
  errorType?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compactString(value: unknown) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return "";
}

function numberOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function titleCaseTagValue(value: string) {
  const normalized = value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "";
  }

  if (/[A-Z]/.test(normalized) && /[a-z]/.test(normalized)) {
    return normalized;
  }

  return normalized.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function normalizeTagSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseCacheSyncPayload(value: Prisma.JsonValue | null) {
  if (!isRecord(value)) {
    return null;
  }

  if (
    value.kind !== "furtrack-cache-sync" ||
    value.version !== 1 ||
    typeof value.tag !== "string"
  ) {
    return null;
  }

  return {
    kind: "furtrack-cache-sync",
    version: 1,
    tag: value.tag,
    pages:
      typeof value.pages === "number"
        ? Math.min(Math.max(Math.trunc(value.pages), 1), 25)
        : 10,
    maxPosts:
      typeof value.maxPosts === "number"
        ? Math.min(Math.max(Math.trunc(value.maxPosts), 1), 5000)
        : 2000,
    refreshExisting: value.refreshExisting !== false,
  } satisfies FurtrackCacheSyncPayload;
}

function publicPostUrl(postId: string) {
  return `${FURTRACK_PUBLIC_BASE_URL}/p/${postId}`;
}

function buildFurtrackImageUrl(post: FurtrackPostMetadata) {
  return `https://orca2.furtrack.com/gallery/${encodeURIComponent(post.submitUserId)}/${encodeURIComponent(post.postId)}-${encodeURIComponent(post.metaFingerprint)}.${encodeURIComponent(post.metaFiletype)}`;
}

function firstRecord(...values: unknown[]) {
  return values.find(isRecord) as Record<string, unknown> | undefined;
}

function objectString(value: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const candidate = compactString(value[key]);

    if (candidate) {
      return candidate;
    }
  }

  return "";
}

function collectTagStringsFromPayload(payload: unknown) {
  const found = new Set<string>();

  function add(value: unknown) {
    const candidate = compactString(value);

    if (candidate) {
      found.add(candidate);
    }
  }

  function walk(value: unknown, keyHint = "") {
    if (!value) {
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") {
          add(item);
          continue;
        }

        if (isRecord(item)) {
          const explicitTag = objectString(item, [
            "tagName",
            "tag",
            "tagSlug",
            "tagValue",
            "value",
          ]);

          if (explicitTag) {
            add(explicitTag);
            continue;
          }
        }

        walk(item, keyHint);
      }

      return;
    }

    if (!isRecord(value)) {
      return;
    }

    const explicitTag = objectString(value, [
      "tagName",
      "tag",
      "tagSlug",
      "tagValue",
    ]);

    if (explicitTag) {
      add(explicitTag);
    }

    for (const [key, child] of Object.entries(value)) {
      if (
        key === "tags" ||
        key === "tagList" ||
        key === "postTags" ||
        key === "tagAlso" ||
        key === "tagChildrenFull"
      ) {
        walk(child, key);
      } else if (keyHint && /tag/i.test(keyHint)) {
        walk(child, keyHint);
      } else if (key === "tagmeta" || key === "tagMeta" || key === "tagMetadata") {
        walk(child, key);
      }
    }
  }

  walk(payload);

  return [...found];
}

function parseFurtrackTag(rawTag: string): ParsedFurtrackTag | null {
  const trimmed = rawTag.trim().replace(/^#/, "");
  const prefixMatch = trimmed.match(/^([^:]+):(.+)$/);
  const prefix = prefixMatch?.[1]?.toLowerCase();
  const rawValue = (prefixMatch?.[2] ?? trimmed).trim();

  if (!rawValue) {
    return null;
  }

  const category =
    prefix === "1" || prefix === "character" || prefix === "char"
      ? "CHARACTER"
      : prefix === "2" || prefix === "maker"
        ? "MAKER"
        : prefix === "5" || prefix === "event" || prefix === "convention" || prefix === "con"
          ? "EVENT"
          : prefix === "6" || prefix === "species"
            ? "SPECIES"
            : "GENERAL";
  const name =
    category === "GENERAL" && prefix === "3"
      ? `Photographer: ${titleCaseTagValue(rawValue)}`
      : titleCaseTagValue(rawValue);
  const slug = normalizeTagSlug(name);

  if (!name || !slug) {
    return null;
  }

  return {
    category,
    slug,
    name,
    rawValue: trimmed,
  };
}

function parseFurtrackTags(rawTags: string[]) {
  const grouped = new Map<string, ParsedFurtrackTag>();

  for (const rawTag of rawTags) {
    const parsed = parseFurtrackTag(rawTag);

    if (!parsed) {
      continue;
    }

    grouped.set(
      `${parsed.category}:${parsed.slug}:${parsed.rawValue.toLowerCase()}`,
      parsed,
    );
  }

  return [...grouped.values()];
}

function extractPostMetadata(payload: unknown, fallbackPostId: string) {
  const root = isRecord(payload) ? payload : {};
  const post = firstRecord(root.post, root.postData, root);

  if (!post) {
    throw new Error("Furtrack response did not include post metadata.");
  }

  const postId = compactString(post.postId) || compactString(post.id) || fallbackPostId;
  const submitUserId =
    compactString(post.submitUserId) ||
    compactString(post.submit_user_id) ||
    compactString(post.userId);
  const metaFingerprint = compactString(post.metaFingerprint);
  const metaFiletype = compactString(post.metaFiletype);

  if (!postId || !submitUserId || !metaFingerprint || !metaFiletype) {
    throw new Error("Furtrack post metadata is missing image fields.");
  }

  return {
    postId,
    submitUserId,
    metaFingerprint,
    metaFiletype,
    metaWidth: numberOrNull(post.metaWidth),
    metaHeight: numberOrNull(post.metaHeight),
  } satisfies FurtrackPostMetadata;
}

async function getFurtrackRuntimeSettings(): Promise<FurtrackRuntimeSettings> {
  const record = await prisma.appSettings.findUnique({
    where: {
      id: "default",
    },
    select: {
      furtrackAuthToken: true,
      furtrackBaseUrl: true,
      furtrackImpersonate: true,
    },
  });
  const recordToken = decryptSecret(record?.furtrackAuthToken)?.trim() || null;
  const envToken = env.FURTRACK_AUTH_TOKEN ?? env.FURTRACK_API_KEY ?? null;

  return {
    authToken: recordToken ?? envToken,
    baseUrl:
      record?.furtrackBaseUrl?.trim() || env.FURTRACK_BASE_URL || "https://solar.furtrack.com",
    fetchMode: env.FURTRACK_FETCH_MODE,
    curlCffiCommand: env.FURTRACK_CURL_CFFI_COMMAND,
    curlCffiScript: env.FURTRACK_CURL_CFFI_SCRIPT,
    curlCffiImpersonate:
      record?.furtrackImpersonate?.trim() || env.FURTRACK_CURL_CFFI_IMPERSONATE,
  };
}

function furtrackApiHeaders(settings: FurtrackRuntimeSettings) {
  const bearer = settings.authToken
    ? settings.authToken.replace(/^bearer\s+/i, "").trim()
    : null;

  return {
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    Origin: FURTRACK_PUBLIC_BASE_URL,
    Referer: `${FURTRACK_PUBLIC_BASE_URL}/`,
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
    ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
  };
}

function furtrackImageHeaders() {
  return {
    Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    Referer: `${FURTRACK_PUBLIC_BASE_URL}/`,
  };
}

function resolveCurlCffiScript(settings: FurtrackRuntimeSettings) {
  if (settings.curlCffiScript !== "scripts/furtrack_fetch.py") {
    return settings.curlCffiScript;
  }

  return process.cwd().replaceAll("\\", "/").endsWith("/worker")
    ? "../scripts/furtrack_fetch.py"
    : "scripts/furtrack_fetch.py";
}

function runCurlCffiRequest(args: {
  settings: FurtrackRuntimeSettings;
  url: string;
  headers: Record<string, string>;
  responseType: "text" | "base64";
}): Promise<FurtrackBridgeResponse> {
  return new Promise((resolve, reject) => {
    const child = spawn(args.settings.curlCffiCommand, [resolveCurlCffiScript(args.settings)], {
      cwd: process.cwd(),
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", () => {
      const text = Buffer.concat(stdout).toString("utf8");

      try {
        const parsed = JSON.parse(text || "{}") as FurtrackBridgeResponse;

        if (parsed.error) {
          reject(
            new Error(
              `curl_cffi request failed: ${parsed.errorType ?? "Error"} ${parsed.error}`,
            ),
          );
          return;
        }

        resolve(parsed);
      } catch (error) {
        const stderrText = Buffer.concat(stderr).toString("utf8").trim();
        reject(
          new Error(
            stderrText ||
              (error instanceof Error
                ? error.message
                : "curl_cffi helper returned invalid JSON."),
          ),
        );
      }
    });

    child.stdin.end(
      JSON.stringify({
        method: "GET",
        url: args.url,
        headers: args.headers,
        responseType: args.responseType,
        timeoutSeconds: 35,
        impersonate: args.settings.curlCffiImpersonate,
      }),
    );
  });
}

function summarizeFurtrackBody(body: string | undefined) {
  const trimmed = body?.trim();

  if (!trimmed) {
    return "";
  }

  const snippet = trimmed.length > 240 ? `${trimmed.slice(0, 240)}...` : trimmed;
  return ` - ${snippet.replace(/\s+/g, " ")}`;
}

function throwFurtrackStatus(args: {
  status: number;
  url: string;
  body?: string;
}): never {
  const bodyHint = summarizeFurtrackBody(args.body);
  throw new Error(`Furtrack returned HTTP ${args.status} for ${args.url}${bodyHint}`);
}

async function fetchWithCurlCffi(args: {
  settings: FurtrackRuntimeSettings;
  url: string;
  headers: Record<string, string>;
  responseType: "text" | "base64";
}) {
  const response = await runCurlCffiRequest(args);
  const status = response.status ?? 0;

  if (status < 200 || status >= 300) {
    throwFurtrackStatus({
      status,
      url: args.url,
      body: response.bodyText,
    });
  }

  if (args.responseType === "base64") {
    if (!response.bodyBase64) {
      throw new Error("curl_cffi helper did not return image bytes.");
    }

    return Buffer.from(response.bodyBase64, "base64");
  }

  return response.bodyText ?? "";
}

async function fetchWithNode(args: {
  url: string;
  headers: Record<string, string>;
  responseType: "text" | "base64";
}) {
  const response = await fetch(args.url, {
    headers: args.headers,
  });

  if (!response.ok) {
    let body: string | undefined;

    try {
      body = await response.text();
    } catch {
      body = undefined;
    }

    throwFurtrackStatus({
      status: response.status,
      url: args.url,
      body,
    });
  }

  if (args.responseType === "base64") {
    return Buffer.from(await response.arrayBuffer());
  }

  return response.text();
}

async function fetchFurtrackResource(args: {
  url: string;
  headers: Record<string, string>;
  responseType: "text" | "base64";
}) {
  const settings = await getFurtrackRuntimeSettings();

  if (settings.fetchMode !== "node") {
    try {
      return await fetchWithCurlCffi({
        ...args,
        settings,
      });
    } catch (error) {
      if (settings.fetchMode === "curl_cffi") {
        throw error;
      }

      console.warn(
        `[furtrack-cache] curl_cffi failed; falling back to node fetch. Cause: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return fetchWithNode(args);
}

async function fetchFurtrackJson(pathname: string) {
  const settings = await getFurtrackRuntimeSettings();
  const url = `${settings.baseUrl.replace(/\/$/, "")}${pathname}`;
  const text = await fetchFurtrackResource({
    url,
    headers: furtrackApiHeaders(settings),
    responseType: "text",
  });
  const body = text.toString();

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Error(`Furtrack returned non-JSON for ${url}${summarizeFurtrackBody(body)}`);
  }
}

async function loadFurtrackImageBuffer(url: string) {
  const buffer = await fetchFurtrackResource({
    url,
    headers: furtrackImageHeaders(),
    responseType: "base64",
  });

  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}

async function loadFurtrackPostIdsByTagPage(args: {
  tag: string;
  page: number;
  maxPosts: number;
}) {
  const path =
    args.page === 0
      ? `/view/index/${encodeURIComponent(args.tag)}`
      : `/view/index/${encodeURIComponent(args.tag)}/${args.page}`;
  const payload = await fetchFurtrackJson(path);
  const posts = isRecord(payload) && Array.isArray(payload.posts) ? payload.posts : [];
  const postIds: string[] = [];

  for (const post of posts) {
    const postId = isRecord(post)
      ? compactString(post.postId) || compactString(post.id)
      : compactString(post);

    if (postId && !postIds.includes(postId)) {
      postIds.push(postId);
    }

    if (postIds.length >= args.maxPosts) {
      break;
    }
  }

  return postIds;
}

async function loadFurtrackPost(postId: string): Promise<FurtrackPostDetail> {
  const rawPayload = await fetchFurtrackJson(
    `/view/post/${encodeURIComponent(postId)}`,
  );

  if (isRecord(rawPayload) && rawPayload.success === false) {
    throw new Error("Furtrack did not return an active post for that ID.");
  }

  const post = extractPostMetadata(rawPayload, postId);

  return {
    post,
    tags: parseFurtrackTags(collectTagStringsFromPayload(rawPayload)),
    externalUrl: publicPostUrl(post.postId),
    imageUrl: buildFurtrackImageUrl(post),
  };
}

function bigintToHash(value: bigint) {
  return value.toString(16).padStart(16, "0");
}

async function fingerprintImage(buffer: Buffer) {
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
    dHash: bigintToHash(hash),
    averageHash: bigintToHash(averageHash),
    width: metadata.width ?? null,
    height: metadata.height ?? null,
  };
}

async function cachePost(postId: string, refreshExisting: boolean) {
  const existing = await prisma.furtrackCachedPost.findUnique({
    where: {
      postId,
    },
    select: {
      syncStatus: true,
    },
  });

  if (existing?.syncStatus === "READY" && !refreshExisting) {
    return {
      skipped: true,
    };
  }

  const post = await loadFurtrackPost(postId);
  const imageBuffer = await loadFurtrackImageBuffer(post.imageUrl);
  const fingerprint = await fingerprintImage(imageBuffer);
  const now = new Date();

  await prisma.$transaction([
    prisma.furtrackCachedPost.upsert({
      where: {
        postId: post.post.postId,
      },
      create: {
        postId: post.post.postId,
        submitUserId: post.post.submitUserId,
        metaFingerprint: post.post.metaFingerprint,
        metaFiletype: post.post.metaFiletype,
        metaWidth: post.post.metaWidth ?? fingerprint.width,
        metaHeight: post.post.metaHeight ?? fingerprint.height,
        externalUrl: post.externalUrl,
        imageUrl: post.imageUrl,
        dHash: fingerprint.dHash,
        averageHash: fingerprint.averageHash,
        syncStatus: "READY",
        errorMessage: null,
        lastFetchedAt: now,
        lastFingerprintedAt: now,
        missingAt: null,
      },
      update: {
        submitUserId: post.post.submitUserId,
        metaFingerprint: post.post.metaFingerprint,
        metaFiletype: post.post.metaFiletype,
        metaWidth: post.post.metaWidth ?? fingerprint.width,
        metaHeight: post.post.metaHeight ?? fingerprint.height,
        externalUrl: post.externalUrl,
        imageUrl: post.imageUrl,
        dHash: fingerprint.dHash,
        averageHash: fingerprint.averageHash,
        syncStatus: "READY",
        errorMessage: null,
        lastFetchedAt: now,
        lastFingerprintedAt: now,
        missingAt: null,
      },
    }),
    prisma.furtrackCachedTag.deleteMany({
      where: {
        postId: post.post.postId,
      },
    }),
    ...(post.tags.length
      ? [
          prisma.furtrackCachedTag.createMany({
            data: post.tags.map((tag) => ({
              postId: post.post.postId,
              category: tag.category,
              slug: tag.slug,
              name: tag.name,
              rawValue: tag.rawValue,
            })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);

  return {
    skipped: false,
  };
}

async function markPostFailed(postId: string, errorMessage: string) {
  await prisma.furtrackCachedPost.upsert({
    where: {
      postId,
    },
    create: {
      postId,
      syncStatus: /active post|missing image fields/i.test(errorMessage)
        ? "MISSING"
        : "FAILED",
      errorMessage,
      lastFetchedAt: new Date(),
      missingAt: /active post/i.test(errorMessage) ? new Date() : null,
    },
    update: {
      syncStatus: /active post|missing image fields/i.test(errorMessage)
        ? "MISSING"
        : "FAILED",
      errorMessage,
      lastFetchedAt: new Date(),
      missingAt: /active post/i.test(errorMessage) ? new Date() : null,
    },
  });
}

function summarizeErrors(errors: string[]) {
  return [...new Set(errors)].slice(0, 8).join("\n") || null;
}

export async function processFurtrackCacheJob(importJobId: string) {
  const importJob = await prisma.importJob.findUnique({
    where: {
      id: importJobId,
    },
    select: {
      id: true,
      payloadJson: true,
    },
  });

  if (!importJob) {
    throw new Error(`Furtrack sync job ${importJobId} not found`);
  }

  const payload = parseCacheSyncPayload(importJob.payloadJson);

  if (!payload) {
    throw new Error(`Furtrack sync job ${importJobId} has an unsupported payload.`);
  }

  await prisma.importJob.update({
    where: {
      id: importJobId,
    },
    data: {
      status: "RUNNING",
      startedAt: new Date(),
      finishedAt: null,
      errorMessage: null,
      processedItems: 0,
    },
  });

  const postIds = new Set<string>();
  const errors: string[] = [];

  for (let page = 0; page < payload.pages && postIds.size < payload.maxPosts; page += 1) {
    try {
      const pagePostIds = await loadFurtrackPostIdsByTagPage({
        tag: payload.tag,
        page,
        maxPosts: payload.maxPosts - postIds.size,
      });

      for (const postId of pagePostIds) {
        postIds.add(postId);

        if (postIds.size >= payload.maxPosts) {
          break;
        }
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Furtrack page ${page} failed.`);
    }
  }

  await prisma.importJob.update({
    where: {
      id: importJobId,
    },
    data: {
      totalItems: postIds.size,
      payloadJson: {
        ...payload,
        discoveredPostCount: postIds.size,
      },
    },
  });

  let processed = 0;

  for (const postId of postIds) {
    try {
      await cachePost(postId, payload.refreshExisting);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Furtrack post cache failed.";
      errors.push(`${postId}: ${message}`);
      await markPostFailed(postId, message);
    }

    processed += 1;

    await prisma.importJob.update({
      where: {
        id: importJobId,
      },
      data: {
        processedItems: processed,
      },
    });
  }

  await prisma.importJob.update({
    where: {
      id: importJobId,
    },
    data: {
      status: errors.length ? "FAILED" : "SUCCEEDED",
      errorMessage: summarizeErrors(errors),
      processedItems: processed,
      totalItems: postIds.size,
      finishedAt: new Date(),
    },
  });
}
