import "server-only";

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

import { getAppSettingsRecord } from "@/lib/app-settings";
import { env } from "@/lib/env";
import { decryptSecret } from "@/lib/secret-box";
import {
  normalizeTagName,
  normalizeTagSlug,
  type TagCategoryValue,
  type TagDraft,
} from "@/lib/tags";

const FURTRACK_PUBLIC_BASE_URL = "https://www.furtrack.com";
const MAX_TAGS_PER_IMPORT = 80;

const furtrackPrefixMap: Record<string, TagCategoryValue> = {
  "1": "CHARACTER",
  character: "CHARACTER",
  char: "CHARACTER",
  "2": "MAKER",
  maker: "MAKER",
  "3": "GENERAL",
  photographer: "GENERAL",
  "5": "EVENT",
  event: "EVENT",
  convention: "EVENT",
  con: "EVENT",
  "6": "SPECIES",
  species: "SPECIES",
  general: "GENERAL",
  tag: "GENERAL",
};

export type FurtrackResolvedTag = TagDraft & {
  aliases: Array<{
    name: string;
    slug?: string;
  }>;
  rawValues: string[];
};

export type FurtrackImportSource =
  | {
      kind: "post";
      postId: string;
      externalUrl: string;
      rawPayload: unknown;
    }
  | {
      kind: "tag-list";
      postId: null;
      externalUrl: null;
      rawPayload: null;
    };

export type FurtrackImportPayload = {
  source: FurtrackImportSource;
  tags: FurtrackResolvedTag[];
};

export type FurtrackPostMetadata = {
  postId: string;
  submitUserId: string;
  metaFingerprint: string;
  metaFiletype: string;
  metaWidth: number | null;
  metaHeight: number | null;
};

export type FurtrackPostDetail = {
  post: FurtrackPostMetadata;
  tags: FurtrackResolvedTag[];
  rawTags: string[];
  rawPayload: unknown;
  externalUrl: string;
  imageUrl: string;
};

type FurtrackFetchOptions = {
  revalidateSeconds?: number;
};

export type FurtrackRuntimeSettings = {
  authToken: string | null;
  baseUrl: string;
  authTokenSaved: boolean;
  fetchMode: "auto" | "curl_cffi" | "node";
  curlCffiCommand: string;
  curlCffiScript: string;
  curlCffiImpersonate: string;
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

function parseReferencePostId(reference: string) {
  const trimmed = reference.trim();

  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const pathMatch = url.pathname.match(/(?:post|posts|p|view\/post)\/(\d+)/i);

    if (pathMatch?.[1]) {
      return pathMatch[1];
    }

    const idParam =
      url.searchParams.get("id") ??
      url.searchParams.get("post") ??
      url.searchParams.get("postId");

    if (idParam && /^\d+$/.test(idParam)) {
      return idParam;
    }
  } catch {
    return null;
  }

  return null;
}

function looksLikeFurtrackTag(value: string) {
  return /^(?:\d+|character|char|maker|event|convention|con|species|general|tag):.+/i.test(
    value.trim(),
  );
}

function maybeRawTagList(reference: string) {
  const tokens = reference
    .split(/[\n,;\s]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length <= 1) {
    return looksLikeFurtrackTag(reference) ? [reference.trim()] : null;
  }

  const taggedTokens = tokens.filter(looksLikeFurtrackTag);
  return taggedTokens.length ? taggedTokens : null;
}

function publicPostUrl(postId: string) {
  return `${FURTRACK_PUBLIC_BASE_URL}/p/${postId}`;
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

function firstRecord(...values: unknown[]) {
  return values.find(isRecord) as Record<string, unknown> | undefined;
}

function extractPostMetadata(payload: unknown, fallbackPostId: string): FurtrackPostMetadata {
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
  };
}

export function buildFurtrackImageUrl(post: FurtrackPostMetadata) {
  return `https://orca2.furtrack.com/gallery/${encodeURIComponent(post.submitUserId)}/${encodeURIComponent(post.postId)}-${encodeURIComponent(post.metaFingerprint)}.${encodeURIComponent(post.metaFiletype)}`;
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

  if (isRecord(payload)) {
    const tags = payload.tags;

    if (Array.isArray(tags)) {
      for (const tag of tags) {
        if (typeof tag === "string") {
          found.add(tag);
        } else if (isRecord(tag)) {
          const tagName = compactString(tag.tagName);

          if (tagName) {
            found.add(tagName);
          }
        }
      }
    }
  }

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
        continue;
      }

      if (keyHint && /tag/i.test(keyHint)) {
        walk(child, keyHint);
      } else if (key === "tagmeta" || key === "tagMeta" || key === "tagMetadata") {
        walk(child, key);
      }
    }
  }

  walk(payload);

  return [...found];
}

function parseFurtrackTag(rawTag: string): FurtrackResolvedTag | null {
  const trimmed = rawTag.trim().replace(/^#/, "");

  if (!trimmed) {
    return null;
  }

  const prefixMatch = trimmed.match(/^([^:]+):(.+)$/);
  const prefix = prefixMatch?.[1]?.toLowerCase();
  const rawValue = (prefixMatch?.[2] ?? trimmed).trim();

  if (!rawValue) {
    return null;
  }

  const category = prefix ? furtrackPrefixMap[prefix] ?? "GENERAL" : "GENERAL";
  const name =
    category === "GENERAL" && prefix === "3"
      ? `Photographer: ${titleCaseTagValue(rawValue)}`
      : titleCaseTagValue(rawValue);
  const slug = normalizeTagSlug(name);

  if (!name || !slug) {
    return null;
  }

  const aliasCandidates = [
    rawTag,
    trimmed,
    rawValue,
    titleCaseTagValue(rawValue),
    rawValue.replace(/[_-]+/g, " "),
    prefix ? `${prefix}:${rawValue}` : null,
  ].filter((value): value is string => Boolean(value));

  const aliases = [...new Map(
    aliasCandidates
      .map((alias) => ({
        name: normalizeTagName(alias),
        slug: normalizeTagSlug(alias),
      }))
      .filter((alias) => alias.name && alias.slug && alias.slug !== slug)
      .map((alias) => [alias.slug, alias]),
  ).values()];

  return {
    category,
    name,
    slug,
    aliases,
    rawValues: [rawTag],
  };
}

function dedupeFurtrackTags(tags: FurtrackResolvedTag[]) {
  const grouped = new Map<string, FurtrackResolvedTag>();

  for (const tag of tags) {
    const key = `${tag.category}:${tag.slug}`;
    const current = grouped.get(key);

    if (!current) {
      grouped.set(key, tag);
      continue;
    }

    current.rawValues = [...new Set([...current.rawValues, ...tag.rawValues])];
    current.aliases = [
      ...new Map(
        [...current.aliases, ...tag.aliases].map((alias) => [
          alias.slug ?? normalizeTagSlug(alias.name),
          alias,
        ]),
      ).values(),
    ];
  }

  return [...grouped.values()].slice(0, MAX_TAGS_PER_IMPORT);
}

export function parseFurtrackTags(rawTags: string[]) {
  return dedupeFurtrackTags(
    rawTags
      .map((tag) => parseFurtrackTag(tag))
      .filter((tag): tag is FurtrackResolvedTag => Boolean(tag)),
  );
}

export function getFurtrackReferenceSummary(reference: string) {
  const rawTags = maybeRawTagList(reference);

  if (rawTags) {
    const fingerprint = createHash("sha256")
      .update(rawTags.join("\n"))
      .digest("hex")
      .slice(0, 16);

    return {
      kind: "tag-list" as const,
      fingerprint,
      rawTags,
    };
  }

  const postId = parseReferencePostId(reference);

  if (!postId) {
    return null;
  }

  return {
    kind: "post" as const,
    postId,
  };
}

export async function getFurtrackRuntimeSettings(): Promise<FurtrackRuntimeSettings> {
  const record = await getAppSettingsRecord();
  const recordToken = decryptSecret(record?.furtrackAuthToken)?.trim() || null;
  const envToken = env.FURTRACK_AUTH_TOKEN ?? env.FURTRACK_API_KEY ?? null;
  const baseUrl =
    record?.furtrackBaseUrl?.trim() || env.FURTRACK_BASE_URL || "https://solar.furtrack.com";
  const impersonate =
    record?.furtrackImpersonate?.trim() || env.FURTRACK_CURL_CFFI_IMPERSONATE;

  return {
    authToken: recordToken ?? envToken,
    baseUrl,
    authTokenSaved: Boolean(recordToken),
    fetchMode: env.FURTRACK_FETCH_MODE,
    curlCffiCommand: env.FURTRACK_CURL_CFFI_COMMAND,
    curlCffiScript: env.FURTRACK_CURL_CFFI_SCRIPT,
    curlCffiImpersonate: impersonate,
  };
}

function furtrackApiHeaders(settings: FurtrackRuntimeSettings) {
  // Note: deliberately no User-Agent here. When the request runs through
  // curl_cffi with `impersonate=chrome*`, curl_cffi sets a UA + sec-ch-ua
  // bundle that matches its TLS fingerprint. Forcing our own UA creates
  // a UA/TLS mismatch that Furtrack's bot layer rejects with HTTP 400.
  const bearer = settings.authToken
    ? settings.authToken.replace(/^bearer\s+/i, "").trim()
    : null;

  return {
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    Origin: FURTRACK_PUBLIC_BASE_URL,
    Referer: `${FURTRACK_PUBLIC_BASE_URL}/`,
    ...(bearer
      ? {
          Authorization: `Bearer ${bearer}`,
        }
      : {}),
  };
}

function furtrackImageHeaders() {
  // Same UA reasoning as furtrackApiHeaders — let curl_cffi own the UA.
  return {
    Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    Referer: `${FURTRACK_PUBLIC_BASE_URL}/`,
  };
}

function resolveCurlCffiScript(settings: FurtrackRuntimeSettings) {
  if (settings.curlCffiScript !== "scripts/furtrack_fetch.py") {
    return settings.curlCffiScript;
  }

  return process.cwd().replaceAll("\\", "/").endsWith("/app")
    ? "../scripts/furtrack_fetch.py"
    : "scripts/furtrack_fetch.py";
}

type FurtrackBridgeResponse = {
  status?: number;
  bodyText?: string;
  bodyBase64?: string;
  error?: string;
  errorType?: string;
};

function runCurlCffiRequest(args: {
  settings: FurtrackRuntimeSettings;
  url: string;
  headers: Record<string, string>;
  responseType: "text" | "base64";
}): Promise<FurtrackBridgeResponse> {
  return new Promise((resolve, reject) => {
    const scriptPath = resolveCurlCffiScript(args.settings);
    const child = spawn(args.settings.curlCffiCommand, [scriptPath], {
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
  options?: FurtrackFetchOptions;
}) {
  const response = await fetch(args.url, {
    headers: args.headers,
    next: {
      revalidate: args.options?.revalidateSeconds ?? 60,
    },
  });

  if (!response.ok) {
    // Read the body before throwing so the error message can include
    // whatever Furtrack told us about the rejection.
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

function summarizeFurtrackBody(body: string | undefined) {
  if (!body) {
    return "";
  }

  const trimmed = body.trim();
  if (!trimmed) {
    return "";
  }

  const snippet = trimmed.length > 240 ? `${trimmed.slice(0, 240)}…` : trimmed;
  return ` — ${snippet.replace(/\s+/g, " ")}`;
}

function throwFurtrackStatus(args: {
  status: number;
  url: string;
  body?: string;
}): never {
  const bodyHint = summarizeFurtrackBody(args.body);
  const tail = ` (HTTP ${args.status} ${args.url}${bodyHint})`;

  if (args.status === 401) {
    throw new Error(
      `Furtrack requires a Bearer JWT token. Save one from the Furtrack admin page or set FURTRACK_AUTH_TOKEN.${tail}`,
    );
  }

  if (args.status === 403) {
    throw new Error(
      `Furtrack rejected the request. Use curl_cffi mode with a valid saved Bearer token.${tail}`,
    );
  }

  if (args.status === 429) {
    throw new Error(`Furtrack rate limited the request. Wait and retry.${tail}`);
  }

  throw new Error(`Furtrack returned HTTP ${args.status}.${tail}`);
}

async function fetchFurtrackResource(args: {
  url: string;
  headers: Record<string, string>;
  responseType: "text" | "base64";
  options?: FurtrackFetchOptions;
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
    }
  }

  return fetchWithNode(args);
}

async function fetchFurtrackJson(pathname: string, options?: FurtrackFetchOptions) {
  const settings = await getFurtrackRuntimeSettings();
  const text = await fetchFurtrackResource({
    url: `${settings.baseUrl.replace(/\/$/, "")}${pathname}`,
    headers: furtrackApiHeaders(settings),
    responseType: "text",
    options,
  });

  return JSON.parse(text.toString()) as unknown;
}

export async function loadFurtrackImageBuffer(url: string) {
  const buffer = await fetchFurtrackResource({
    url,
    headers: furtrackImageHeaders(),
    responseType: "base64",
  });

  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}

export async function loadFurtrackPost(postId: string): Promise<FurtrackPostDetail> {
  const rawPayload = await fetchFurtrackJson(
    `/view/post/${encodeURIComponent(postId)}`,
  );

  if (isRecord(rawPayload) && rawPayload.success === false) {
    throw new Error("Furtrack did not return an active post for that ID.");
  }

  const post = extractPostMetadata(rawPayload, postId);
  const rawTags = collectTagStringsFromPayload(rawPayload);
  const tags = parseFurtrackTags(rawTags);

  return {
    post,
    tags,
    rawTags,
    rawPayload,
    externalUrl: publicPostUrl(post.postId),
    imageUrl: buildFurtrackImageUrl(post),
  };
}

export async function loadFurtrackPostIdsByTag(args: {
  tag: string;
  pages?: number;
  maxPosts?: number;
}) {
  const pages = Math.min(Math.max(args.pages ?? 1, 1), 10);
  const maxPosts = Math.min(Math.max(args.maxPosts ?? 80, 1), 600);
  const postIds: string[] = [];

  for (let page = 0; page < pages && postIds.length < maxPosts; page += 1) {
    const path =
      page === 0
        ? `/view/index/${encodeURIComponent(args.tag)}`
        : `/view/index/${encodeURIComponent(args.tag)}/${page}`;
    const payload = await fetchFurtrackJson(path);
    const posts = isRecord(payload) && Array.isArray(payload.posts) ? payload.posts : [];

    for (const post of posts) {
      const postId = isRecord(post)
        ? compactString(post.postId) || compactString(post.id)
        : compactString(post);

      if (postId && !postIds.includes(postId)) {
        postIds.push(postId);
      }

      if (postIds.length >= maxPosts) {
        break;
      }
    }
  }

  return postIds;
}

export async function loadFurtrackImportPayload(
  reference: string,
): Promise<FurtrackImportPayload> {
  const summary = getFurtrackReferenceSummary(reference);

  if (!summary) {
    throw new Error("Enter a Furtrack post URL, post ID, or Furtrack tag list.");
  }

  if (summary.kind === "tag-list") {
    return {
      source: {
        kind: "tag-list",
        postId: null,
        externalUrl: null,
        rawPayload: null,
      },
      tags: parseFurtrackTags(summary.rawTags),
    };
  }

  const post = await loadFurtrackPost(summary.postId);

  if (!post.tags.length) {
    throw new Error("No Furtrack tags were found for that post.");
  }

  return {
    source: {
      kind: "post",
      postId: post.post.postId,
      externalUrl: post.externalUrl,
      rawPayload: post.rawPayload,
    },
    tags: post.tags,
  };
}
