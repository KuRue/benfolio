/* eslint-disable @next/next/no-img-element */
"use client";

import { useMemo, useState } from "react";

type AdminEventOption = {
  id: string;
  title: string;
  slug: string;
  visibility: "DRAFT" | "HIDDEN" | "PUBLIC";
  eventDateLabel: string;
};

type FurtrackSettings = {
  baseUrl: string;
  impersonate: string;
  photographerHandle: string | null;
  hasSavedToken: boolean;
  hasEnvToken: boolean;
};

type FurtrackCacheSummary = {
  readyPostCount: number;
  failedPostCount: number;
  missingPostCount: number;
  pendingPostCount: number;
  tagCount: number;
  lastFetchedAt: string | null;
  recentJobs: Array<{
    id: string;
    status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
    totalItems: number;
    processedItems: number;
    errorMessage: string | null;
    createdAt: string;
    updatedAt: string;
    finishedAt: string | null;
    payload: {
      tag: string | null;
      pages: number | null;
      maxPosts: number | null;
      syncAll: boolean | null;
    } | null;
  }>;
};

type VisualMatch = {
  postId: string;
  externalUrl: string;
  imageUrl: string;
  score: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  visualSimilarity: number;
  hammingDistance: number;
  aspectScore: number;
  tags: Array<{
    category: string;
    name: string;
    rawValues: string[];
  }>;
};

type EventMatchResult = {
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
  suggestions: Array<{
    localPhoto: {
      id: string;
      originalFilename: string;
      previewUrl: string | null;
    };
    bestMatch: VisualMatch;
    alternatives: VisualMatch[];
  }>;
  unmatchedPhotos: Array<{
    id: string;
    originalFilename: string;
    previewUrl: string | null;
    bestScore: number | null;
  }>;
  errors: Array<{
    postId: string;
    error: string;
  }>;
};

type FurtrackMatchRun = {
  id: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
  errorMessage: string | null;
  stage: "discover" | "local" | "candidates" | "finalize" | "complete" | null;
  progress: {
    current: number;
    total: number;
    label: string;
  } | null;
  result: EventMatchResult | null;
};

type FurtrackMatchPanelProps = {
  events: AdminEventOption[];
  furtrackSettings: FurtrackSettings;
  furtrackCache: FurtrackCacheSummary;
};

function parseList(value: string) {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatPercent(value: number) {
  return `${Math.round(value * 1000) / 10}%`;
}

function confidenceClass(confidence: VisualMatch["confidence"]) {
  switch (confidence) {
    case "HIGH":
      return "border-emerald-400/25 bg-emerald-400/10 text-emerald-100";
    case "MEDIUM":
      return "border-[#9588ff]/35 bg-[#9588ff]/12 text-[#d9d5ff]";
    default:
      return "border-white/10 bg-white/6 text-white/62";
  }
}

function isExactMatch(match: VisualMatch) {
  return match.hammingDistance === 0;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function formatRunProgress(run: FurtrackMatchRun) {
  if (!run.progress) {
    return "Starting Furtrack match run.";
  }

  const percent = run.progress.total
    ? Math.min(100, Math.round((run.progress.current / run.progress.total) * 100))
    : 0;

  return `${run.progress.label} · ${percent}%`;
}

async function readJsonResponse<T extends { error?: string }>(
  response: Response,
  fallbackError: string,
) {
  const text = await response.text();
  let payload: T;

  try {
    payload = JSON.parse(text) as T;
  } catch {
    const normalized = text.replace(/\s+/g, " ").trim();
    const snippet = normalized.length > 220
      ? `${normalized.slice(0, 220)}...`
      : normalized;
    const status = `${response.status} ${response.statusText}`.trim();

    throw new Error(
      snippet
        ? `${fallbackError} (${status}): ${snippet}`
        : `${fallbackError} (${status}).`,
    );
  }

  if (!response.ok) {
    throw new Error(payload.error ?? `${fallbackError} (${response.status}).`);
  }

  return payload;
}

export function FurtrackMatchTestPanel({
  events,
  furtrackSettings,
  furtrackCache,
}: FurtrackMatchPanelProps) {
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  // Pre-fill the candidate-tags textarea with the photographer feed when a
  // handle is configured. Furtrack's event-tag naming is unpredictable
  // (e.g. `5:megaplex` exists but `5:megaplex2025` does not), so scanning
  // your own `3:<handle>` feed is a more reliable default than guessing
  // event tag names from benfolio event titles.
  const [candidateTags, setCandidateTags] = useState(
    furtrackSettings.photographerHandle
      ? `3:${furtrackSettings.photographerHandle}`
      : "",
  );
  const [postIds, setPostIds] = useState("");
  const [baseUrl, setBaseUrl] = useState(furtrackSettings.baseUrl);
  const [impersonate, setImpersonate] = useState(furtrackSettings.impersonate);
  const [photographerHandle, setPhotographerHandle] = useState(
    furtrackSettings.photographerHandle ?? "",
  );
  const [authToken, setAuthToken] = useState("");
  const [hasSavedToken, setHasSavedToken] = useState(furtrackSettings.hasSavedToken);
  const [pending, setPending] = useState(false);
  const [syncPending, setSyncPending] = useState(false);
  const [settingsPending, setSettingsPending] = useState(false);
  const [cacheSyncPending, setCacheSyncPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EventMatchResult | null>(null);
  const [matchRun, setMatchRun] = useState<FurtrackMatchRun | null>(null);
  const [dismissedKeys, setDismissedKeys] = useState<string[]>([]);

  const selectedEvent = events.find((event) => event.id === eventId);
  const visibleSuggestions = useMemo(
    () =>
      (result?.suggestions ?? []).filter(
        (suggestion) =>
          !dismissedKeys.includes(
            `${suggestion.localPhoto.id}:${suggestion.bestMatch.postId}`,
          ),
      ),
    [dismissedKeys, result],
  );
  const exactCount = visibleSuggestions.filter((suggestion) =>
    isExactMatch(suggestion.bestMatch),
  ).length;
  const reviewCount = visibleSuggestions.length - exactCount;

  async function saveSettings(options?: { clearToken?: boolean }) {
    setSettingsPending(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/furtrack/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          baseUrl,
          impersonate,
          photographerHandle,
          authToken: options?.clearToken ? "" : authToken,
          clearToken: options?.clearToken ?? false,
        }),
      });
      const payload = await readJsonResponse<{
        error?: string;
        message?: string;
        settings?: {
          baseUrl: string;
          impersonate: string;
          photographerHandle: string | null;
          hasSavedToken: boolean;
        };
      }>(response, "Unable to save Furtrack settings.");

      if (!payload.settings) {
        throw new Error(payload.error ?? "Unable to save Furtrack settings.");
      }

      setBaseUrl(payload.settings.baseUrl);
      setImpersonate(payload.settings.impersonate);
      setPhotographerHandle(payload.settings.photographerHandle ?? "");
      setHasSavedToken(payload.settings.hasSavedToken);
      setAuthToken("");
      setNotice(options?.clearToken ? "Furtrack token cleared." : "Furtrack settings saved.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to save Furtrack settings.",
      );
    } finally {
      setSettingsPending(false);
    }
  }

  async function syncCache() {
    const tag =
      parseList(candidateTags)[0] ||
      (photographerHandle ? `3:${photographerHandle}` : "");

    if (!tag) {
      setError("Set a photographer handle or candidate tag first.");
      return;
    }

    if (
      !window.confirm(
        `Queue a full Furtrack cache sync for ${tag}? This runs in the worker and may take a while.`,
      )
    ) {
      return;
    }

    setCacheSyncPending(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/furtrack/cache-sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tag,
          refreshExisting: true,
        }),
      });
      const payload = await readJsonResponse<{
        error?: string;
        message?: string;
        job?: {
          id: string;
        };
      }>(response, "Unable to queue Furtrack cache sync.");

      setNotice(
        payload.job
          ? `Cache sync queued: ${payload.job.id}. Refresh this page to see progress.`
          : payload.message ?? "Cache sync queued.",
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to queue Furtrack cache sync.",
      );
    } finally {
      setCacheSyncPending(false);
    }
  }

  async function findMatches() {
    if (!eventId) {
      setError("Choose an event first.");
      return;
    }

    setPending(true);
    setError(null);
    setNotice(null);
    setDismissedKeys([]);
    setResult(null);
    setMatchRun(null);

    try {
      const requestPayload = {
        eventId,
        tags: parseList(candidateTags),
        postIds: parseList(postIds),
      };
      const response = await fetch("/api/admin/furtrack/match-runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestPayload),
      });
      const payload = await readJsonResponse<{
        error?: string;
        run?: FurtrackMatchRun;
      }>(response, "Unable to start Furtrack match run.");

      if (!payload.run) {
        throw new Error(payload.error ?? "Unable to start Furtrack match run.");
      }

      let run = payload.run;
      setMatchRun(run);
      setNotice(formatRunProgress(run));

      for (let steps = 0; steps < 5000; steps += 1) {
        if (run.status === "SUCCEEDED" || run.status === "FAILED") {
          break;
        }

        const stepResponse = await fetch(
          `/api/admin/furtrack/match-runs/${encodeURIComponent(run.id)}/step`,
          {
            method: "POST",
          },
        );
        const stepPayload = await readJsonResponse<{
          error?: string;
          run?: FurtrackMatchRun;
        }>(stepResponse, "Unable to continue Furtrack match run.");

        if (!stepPayload.run) {
          throw new Error(
            stepPayload.error ?? "Unable to continue Furtrack match run.",
          );
        }

        run = stepPayload.run;
        setMatchRun(run);
        setNotice(formatRunProgress(run));
        await wait(40);
      }

      if (run.status === "FAILED") {
        throw new Error(run.errorMessage ?? "Furtrack match run failed.");
      }

      if (!run.result) {
        throw new Error("Furtrack match run did not return a result.");
      }

      setResult(run.result);
      setNotice(
        `Found ${run.result.suggestions.length} possible matches from ${run.result.searched.totalCandidates} candidates.`,
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to find Furtrack matches.",
      );
    } finally {
      setPending(false);
    }
  }

  async function syncExactMatches() {
    if (!eventId) {
      setError("Choose an event first.");
      return;
    }

    const exactSuggestions = visibleSuggestions.filter((suggestion) =>
      isExactMatch(suggestion.bestMatch),
    );

    if (!exactSuggestions.length) {
      setError("Run matching first. No exact matches are currently visible.");
      return;
    }

    if (
      !window.confirm(
        `Sync ${exactSuggestions.length} exact visual match${
          exactSuggestions.length === 1 ? "" : "es"
        }? Non-exact matches will stay untouched.`,
      )
    ) {
      return;
    }

    setSyncPending(true);
    setError(null);
    setNotice(null);

    try {
      const failed: string[] = [];

      for (const suggestion of exactSuggestions) {
        const response = await fetch("/api/admin/furtrack/sync-match", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            photoId: suggestion.localPhoto.id,
            postId: suggestion.bestMatch.postId,
          }),
        });

        try {
          await readJsonResponse<{
            error?: string;
            message?: string;
          }>(response, "Unable to sync exact match.");
          setDismissedKeys((current) => [
            ...current,
            `${suggestion.localPhoto.id}:${suggestion.bestMatch.postId}`,
          ]);
        } catch (caughtError) {
          failed.push(
            caughtError instanceof Error
              ? caughtError.message
              : "Unable to sync exact match.",
          );
        }
      }

      setNotice(
        failed.length
          ? `Synced ${exactSuggestions.length - failed.length} exact matches. ${failed.length} failed.`
          : `Synced ${exactSuggestions.length} exact match${
              exactSuggestions.length === 1 ? "" : "es"
            }.`,
      );

      if (failed.length) {
        setError(failed.slice(0, 3).join(" "));
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to sync exact matches.",
      );
    } finally {
      setSyncPending(false);
    }
  }

  async function syncOneMatch(args: { photoId: string; postId: string }) {
    if (
      !window.confirm(
        "Sync this Furtrack post to the local photo? This will write tags and link the post.",
      )
    ) {
      return;
    }

    setSyncPending(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/furtrack/sync-match", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(args),
      });
      const payload = await readJsonResponse<{
        error?: string;
        message?: string;
      }>(response, "Unable to sync match.");

      setNotice(payload.message ?? "Match synced.");
      setDismissedKeys((current) => [...current, `${args.photoId}:${args.postId}`]);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to sync match.",
      );
    } finally {
      setSyncPending(false);
    }
  }

  function dismissMatch(photoId: string, postId: string) {
    setDismissedKeys((current) => [...current, `${photoId}:${postId}`]);
  }

  return (
    <div className="space-y-6">
      <section className="admin-card space-y-5 px-6 py-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <p className="editorial-label">Furtrack</p>
            <h1 className="font-serif text-3xl tracking-[-0.03em] text-white">
              Match and sync tags
            </h1>
            <p className="max-w-3xl text-sm text-white/58">
              Pick an event. Exact matches can sync automatically; uncertain matches need review.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm text-white/58">
            <span className="glass-chip px-4 py-2">
              {hasSavedToken || furtrackSettings.hasEnvToken ? "Auth set" : "No auth token"}
            </span>
            <span className="glass-chip px-4 py-2">TLS {impersonate || "chrome"}</span>
            {selectedEvent ? (
              <span className="glass-chip px-4 py-2">{selectedEvent.eventDateLabel}</span>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.45fr)]">
          <label className="block space-y-2">
            <span className="text-sm text-white/68">Event</span>
            <select
              value={eventId}
              onChange={(event) => setEventId(event.target.value)}
              className="admin-select"
            >
              {events.length ? null : <option value="">No events found</option>}
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title} · /e/{event.slug} · {event.visibility.toLowerCase()}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <button
              type="button"
              onClick={() => void findMatches()}
              disabled={pending || !eventId}
              className="admin-button"
            >
              {pending ? "Finding..." : "Find matches"}
            </button>
            <button
              type="button"
              onClick={() => void syncExactMatches()}
              disabled={syncPending || pending || !eventId || !exactCount}
              className="rounded-full border border-[#9588ff]/35 bg-[#9588ff]/14 px-4 py-2 text-sm text-white transition hover:bg-[#9588ff]/20 disabled:opacity-40"
            >
              {syncPending ? "Syncing..." : "Sync exact matches"}
            </button>
          </div>
        </div>

        <div className="grid gap-3 rounded-[1.35rem] border border-white/8 bg-black/20 p-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
          <div className="flex flex-wrap gap-2 text-sm text-white/58">
            <span className="glass-chip px-4 py-2">
              {furtrackCache.readyPostCount} cached posts
            </span>
            <span className="glass-chip px-4 py-2">
              {furtrackCache.tagCount} cached tags
            </span>
            <span className="glass-chip px-4 py-2">
              {furtrackCache.failedPostCount} failed
            </span>
            <span className="glass-chip px-4 py-2">
              {furtrackCache.lastFetchedAt
                ? `updated ${new Date(furtrackCache.lastFetchedAt).toLocaleString()}`
                : "cache empty"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void syncCache()}
            disabled={cacheSyncPending || settingsPending}
            className="admin-button-muted"
          >
            {cacheSyncPending ? "Queueing..." : "Sync Furtrack cache"}
          </button>
          {furtrackCache.recentJobs.length ? (
            <div className="space-y-1 text-xs text-white/42 xl:col-span-2">
              {furtrackCache.recentJobs.slice(0, 2).map((job) => (
                <p key={job.id}>
                  {job.payload?.tag ?? "Furtrack"} · all posts ·{" "}
                  {job.status.toLowerCase()} · {job.processedItems}/
                  {job.totalItems || "?"}
                  {job.errorMessage ? ` · ${job.errorMessage.split("\n")[0]}` : ""}
                </p>
              ))}
            </div>
          ) : null}
        </div>

        <details open className="muted-panel px-4 py-4">
          <summary className="cursor-pointer list-none text-sm text-white/74">
            Furtrack connection and search options
          </summary>
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(10rem,0.5fr)_auto]">
              <label className="block space-y-2">
                <span className="text-sm text-white/68">Bearer token</span>
                <input
                  value={authToken}
                  onChange={(event) => setAuthToken(event.target.value)}
                  className="admin-input"
                  type="password"
                  placeholder={hasSavedToken ? "Saved token active" : "Paste Furtrack JWT"}
                />
              </label>
              <label className="block space-y-2">
                <span className="text-sm text-white/68">Base URL</span>
                <input
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  className="admin-input"
                  placeholder="https://solar.furtrack.com"
                />
              </label>
              <label className="block space-y-2">
                <span className="text-sm text-white/68">TLS profile</span>
                <input
                  value={impersonate}
                  onChange={(event) => setImpersonate(event.target.value)}
                  className="admin-input"
                  placeholder="chrome"
                />
              </label>
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => void saveSettings()}
                  disabled={settingsPending}
                  className="admin-button-muted"
                >
                  {settingsPending ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => void saveSettings({ clearToken: true })}
                  disabled={settingsPending || !hasSavedToken}
                  className="admin-button-muted"
                >
                  Clear
                </button>
              </div>
            </div>

            <label className="block space-y-2">
              <span className="text-sm text-white/68">
                Photographer handle{" "}
                <span className="text-white/40">
                  (optional — pre-fills candidate tags with{" "}
                  <code className="text-white/56">3:&lt;handle&gt;</code>)
                </span>
              </span>
              <input
                value={photographerHandle}
                onChange={(event) => setPhotographerHandle(event.target.value)}
                className="admin-input"
                placeholder="kurue"
              />
            </label>

            <div className="grid gap-4 xl:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm text-white/68">Override candidate tags</span>
                <textarea
                  value={candidateTags}
                  onChange={(event) => setCandidateTags(event.target.value)}
                  className="admin-textarea min-h-28"
                  placeholder="Optional. Leave blank to derive from the event."
                />
              </label>
              <label className="block space-y-2">
                <span className="text-sm text-white/68">Specific post IDs</span>
                <textarea
                  value={postIds}
                  onChange={(event) => setPostIds(event.target.value)}
                  className="admin-textarea min-h-28"
                  placeholder="Optional Furtrack post IDs"
                />
              </label>
            </div>
          </div>
        </details>

        {result ? (
          <div className="flex flex-wrap gap-2 text-sm text-white/58">
            <span className="glass-chip px-4 py-2">
              {result.searched.localPhotoCount} local photos
            </span>
            <span className="glass-chip px-4 py-2">
              {result.searched.totalCandidates} Furtrack candidates
            </span>
            <span className="glass-chip px-4 py-2">{exactCount} exact</span>
            <span className="glass-chip px-4 py-2">{reviewCount} review</span>
            <span className="glass-chip px-4 py-2">
              searched {result.searched.tags.join(", ") || "specific posts"}
            </span>
          </div>
        ) : null}

        {pending && matchRun?.progress ? (
          <div className="space-y-2">
            <div className="h-2 overflow-hidden rounded-full bg-white/8">
              <div
                className="h-full rounded-full bg-[#9588ff] transition-[width] duration-300"
                style={{
                  width: `${
                    matchRun.progress.total
                      ? Math.min(
                          100,
                          Math.round(
                            (matchRun.progress.current / matchRun.progress.total) *
                              100,
                          ),
                        )
                      : 4
                  }%`,
                }}
              />
            </div>
            <p className="text-xs uppercase tracking-[0.18em] text-white/42">
              {matchRun.progress.label}
            </p>
          </div>
        ) : null}

        {error ? <p className="admin-note-error">{error}</p> : null}
        {notice ? <p className="admin-note">{notice}</p> : null}
      </section>

      {result ? (
        <section className="space-y-5">
          <div className="space-y-4">
            {visibleSuggestions.map((suggestion) => {
              const exact = isExactMatch(suggestion.bestMatch);

              return (
                <article
                  key={`${suggestion.localPhoto.id}:${suggestion.bestMatch.postId}`}
                  className="overflow-hidden rounded-[1.6rem] border border-white/8 bg-white/[0.035]"
                >
                  <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="grid gap-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
                      {suggestion.localPhoto.previewUrl ? (
                        <img
                          src={suggestion.localPhoto.previewUrl}
                          alt=""
                          className="aspect-[4/5] w-full rounded-[1.15rem] object-cover"
                        />
                      ) : null}
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-white/88">
                          {suggestion.localPhoto.originalFilename}
                        </p>
                        <p className="text-xs uppercase tracking-[0.18em] text-white/38">
                          Local {suggestion.localPhoto.id}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
                      <img
                        src={suggestion.bestMatch.imageUrl}
                        alt=""
                        className="aspect-[4/5] w-full rounded-[1.15rem] object-cover"
                      />
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.2em] ${confidenceClass(suggestion.bestMatch.confidence)}`}
                          >
                            {exact ? "EXACT" : suggestion.bestMatch.confidence}
                          </span>
                          <span className="glass-chip px-3 py-1 text-xs text-white">
                            {formatPercent(suggestion.bestMatch.score)}
                          </span>
                          <a
                            href={suggestion.bestMatch.externalUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="admin-button-muted px-3 py-1.5 text-xs"
                          >
                            Post {suggestion.bestMatch.postId}
                          </a>
                        </div>
                        <div className="grid gap-2 text-sm text-white/58 sm:grid-cols-2">
                          <p>
                            Visual{" "}
                            <span className="text-white/78">
                              {formatPercent(suggestion.bestMatch.visualSimilarity)}
                            </span>
                          </p>
                          <p>
                            Distance{" "}
                            <span className="text-white/78">
                              {suggestion.bestMatch.hammingDistance}
                            </span>
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {suggestion.bestMatch.tags.slice(0, 10).map((tag) => (
                            <span
                              key={`${suggestion.bestMatch.postId}:${tag.category}:${tag.name}`}
                              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/72"
                            >
                              <span className="text-white/40">{tag.category}</span>{" "}
                              {tag.name}
                            </span>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() =>
                              void syncOneMatch({
                                photoId: suggestion.localPhoto.id,
                                postId: suggestion.bestMatch.postId,
                              })
                            }
                            disabled={syncPending}
                            className="admin-button-muted"
                          >
                            {exact ? "Sync" : "Confirm and sync"}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              dismissMatch(
                                suggestion.localPhoto.id,
                                suggestion.bestMatch.postId,
                              )
                            }
                            disabled={syncPending}
                            className="admin-button-muted"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {result.unmatchedPhotos.length ? (
            <details className="muted-panel px-5 py-5">
              <summary className="cursor-pointer list-none text-sm text-white/72">
                Unmatched local photos
              </summary>
              <div className="mt-4 grid gap-2 text-sm text-white/52 sm:grid-cols-2">
                {result.unmatchedPhotos.slice(0, 40).map((photo) => (
                  <p key={photo.id}>
                    {photo.originalFilename} · best{" "}
                    {photo.bestScore === null ? "none" : formatPercent(photo.bestScore)}
                  </p>
                ))}
              </div>
            </details>
          ) : null}

          {result.errors.length ? (
            <details className="muted-panel px-5 py-5">
              <summary className="cursor-pointer list-none text-sm text-white/72">
                Candidate errors
              </summary>
              <div className="mt-4 space-y-2 text-sm text-white/52">
                {result.errors.slice(0, 20).map((candidateError) => (
                  <p key={candidateError.postId}>
                    {candidateError.postId}: {candidateError.error}
                  </p>
                ))}
              </div>
            </details>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
