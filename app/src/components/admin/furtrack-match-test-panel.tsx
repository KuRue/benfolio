/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";

type MatchResult = {
  localPhoto: {
    id: string;
    originalFilename: string;
    previewUrl: string | null;
    event: {
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
  matches: Array<{
    postId: string;
    externalUrl: string;
    imageUrl: string;
    score: number;
    confidence: "HIGH" | "MEDIUM" | "LOW";
    visualSimilarity: number;
    hammingDistance: number;
    aspectScore: number;
    dimensions: {
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
  }>;
  errors: Array<{
    postId: string;
    error: string;
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
    localPhoto: MatchResult["localPhoto"];
    bestMatch: MatchResult["matches"][number];
    alternatives: MatchResult["matches"];
  }>;
  unmatchedPhotos: Array<{
    id: string;
    originalFilename: string;
    previewUrl: string | null;
    bestScore: number | null;
  }>;
  errors: MatchResult["errors"];
};

type TestResult =
  | {
      mode: "photo";
      data: MatchResult;
    }
  | {
      mode: "event";
      data: EventMatchResult;
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

function confidenceClass(confidence: "HIGH" | "MEDIUM" | "LOW") {
  switch (confidence) {
    case "HIGH":
      return "border-emerald-400/25 bg-emerald-400/10 text-emerald-100";
    case "MEDIUM":
      return "border-[#9588ff]/35 bg-[#9588ff]/12 text-[#d9d5ff]";
    default:
      return "border-white/10 bg-white/6 text-white/62";
  }
}

export function FurtrackMatchTestPanel() {
  const [mode, setMode] = useState<"photo" | "event">("event");
  const [photoId, setPhotoId] = useState("");
  const [eventId, setEventId] = useState("");
  const [tags, setTags] = useState("");
  const [postIds, setPostIds] = useState("");
  const [maxCandidates, setMaxCandidates] = useState(40);
  const [maxPhotos, setMaxPhotos] = useState(80);
  const [pagesPerTag, setPagesPerTag] = useState(1);
  const [pending, setPending] = useState(false);
  const [syncPending, setSyncPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);

  async function runTest() {
    setPending(true);
    setError(null);
    setNotice(null);
    setResult(null);

    try {
      const response = await fetch("/api/admin/furtrack/match-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode,
          ...(mode === "event"
            ? {
                eventId,
                maxPhotos,
              }
            : {
                photoId,
              }),
          tags: parseList(tags),
          postIds: parseList(postIds),
          maxCandidates,
          pagesPerTag,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        result?: MatchResult | EventMatchResult;
      };

      if (!response.ok || !payload.result) {
        throw new Error(payload.error ?? "Unable to run match test.");
      }

      setResult({
        mode,
        data: payload.result as MatchResult & EventMatchResult,
      });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to run match test.",
      );
    } finally {
      setPending(false);
    }
  }

  async function syncExactMatches() {
    if (mode !== "event" || !eventId.trim()) {
      setError("Run an event batch first.");
      return;
    }

    if (
      !window.confirm(
        "Sync Furtrack tags for exact visual matches only? This will write tags and Furtrack links to matched photos.",
      )
    ) {
      return;
    }

    setSyncPending(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/furtrack/sync-exact-matches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventId,
          tags: parseList(tags),
          postIds: parseList(postIds),
          maxCandidates,
          maxPhotos,
          pagesPerTag,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
        result?: {
          synced?: Array<{
            photoId: string;
            postId: string;
            importedTagCount: number;
          }>;
          failed?: Array<{
            photoId: string;
            postId: string;
            error: string;
          }>;
        };
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to sync exact matches.");
      }

      const failedCount = payload.result?.failed?.length ?? 0;
      setNotice(
        failedCount
          ? `${payload.message ?? "Exact matches synced."} ${failedCount} failed.`
          : (payload.message ?? "Exact matches synced."),
      );
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

  return (
    <div className="space-y-6">
      <section className="admin-card space-y-5 px-6 py-6">
        <div className="space-y-2">
          <p className="editorial-label">Furtrack Lab</p>
          <h1 className="font-serif text-3xl tracking-[-0.03em] text-white">
            Match test
          </h1>
          <p className="max-w-3xl text-sm text-white/58">
            Compares local photos against Furtrack candidates. No tags are imported.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {(["event", "photo"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMode(option)}
              className={
                mode === option
                  ? "rounded-full border border-[#9588ff]/35 bg-[#9588ff]/15 px-4 py-2 text-sm text-white"
                  : "admin-button-muted"
              }
            >
              {option === "event" ? "Event batch" : "Single photo"}
            </button>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <label className="block space-y-2">
            <span className="text-sm text-white/68">
              {mode === "event" ? "Local event ID" : "Local photo ID"}
            </span>
            <input
              value={mode === "event" ? eventId : photoId}
              onChange={(event) =>
                mode === "event"
                  ? setEventId(event.target.value)
                  : setPhotoId(event.target.value)
              }
              className="admin-input"
              placeholder={mode === "event" ? "Event ID" : "Photo ID"}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block space-y-2">
              <span className="text-sm text-white/68">Max candidates</span>
              <input
                type="number"
                min={1}
                max={120}
                value={maxCandidates}
                onChange={(event) => setMaxCandidates(Number(event.target.value))}
                className="admin-input"
              />
            </label>
            {mode === "event" ? (
              <label className="block space-y-2">
                <span className="text-sm text-white/68">Max photos</span>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={maxPhotos}
                  onChange={(event) => setMaxPhotos(Number(event.target.value))}
                  className="admin-input"
                />
              </label>
            ) : null}
            <label className="block space-y-2">
              <span className="text-sm text-white/68">Pages per tag</span>
              <input
                type="number"
                min={1}
                max={5}
                value={pagesPerTag}
                onChange={(event) => setPagesPerTag(Number(event.target.value))}
                className="admin-input"
              />
            </label>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <label className="block space-y-2">
            <span className="text-sm text-white/68">Candidate tags</span>
            <textarea
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              className="admin-textarea min-h-28"
              placeholder="5:FWA_2025&#10;1:Character_Name"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm text-white/68">Candidate post IDs</span>
            <textarea
              value={postIds}
              onChange={(event) => setPostIds(event.target.value)}
              className="admin-textarea min-h-28"
              placeholder="12345&#10;67890"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void runTest()}
            disabled={pending || (mode === "event" ? !eventId.trim() : !photoId.trim())}
            className="admin-button"
          >
            {pending ? "Matching..." : "Run match test"}
          </button>
          <p className="text-sm text-white/44">
            Use a small candidate set while tuning. Furtrack may rate limit large runs.
          </p>
        </div>

        {mode === "event" ? (
          <div className="flex flex-wrap items-center gap-3 rounded-[1.25rem] border border-white/8 bg-white/[0.025] px-4 py-4">
            <button
              type="button"
              onClick={() => void syncExactMatches()}
              disabled={syncPending || pending || !eventId.trim()}
              className="rounded-full border border-[#9588ff]/35 bg-[#9588ff]/14 px-4 py-2 text-sm text-white transition hover:bg-[#9588ff]/20 disabled:opacity-40"
            >
              {syncPending ? "Syncing..." : "Sync 100% matches"}
            </button>
            <p className="text-sm text-white/50">
              Writes tags only when the visual hash is an exact match.
            </p>
          </div>
        ) : null}

        {error ? <p className="admin-note-error">{error}</p> : null}
        {notice ? <p className="admin-note">{notice}</p> : null}
      </section>

      {result?.mode === "photo" ? (
        <section className="space-y-5">
          <div className="muted-panel flex flex-wrap items-center justify-between gap-4 px-5 py-5">
            <div className="flex items-center gap-4">
              {result.data.localPhoto.previewUrl ? (
                <img
                  src={result.data.localPhoto.previewUrl}
                  alt=""
                  className="h-20 w-16 rounded-2xl object-cover"
                />
              ) : null}
              <div>
                <p className="text-sm font-medium text-white/88">
                  {result.data.localPhoto.originalFilename}
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-white/42">
                  {result.data.localPhoto.event.title} · /e/
                  {result.data.localPhoto.event.slug}
                </p>
                <p className="mt-1 text-xs text-white/42">
                  {result.data.localPhoto.hash}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-sm text-white/58">
              <span className="glass-chip px-3 py-1.5">
                {result.data.searched.totalCandidates} candidates
              </span>
              <span className="glass-chip px-3 py-1.5">
                {result.data.matches.length} matches
              </span>
              <span className="glass-chip px-3 py-1.5">
                {result.data.errors.length} errors
              </span>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {result.data.matches.map((match) => (
              <article
                key={match.postId}
                className="overflow-hidden rounded-[1.6rem] border border-white/8 bg-white/[0.035]"
              >
                <div className="grid gap-4 p-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
                  <img
                    src={match.imageUrl}
                    alt=""
                    className="aspect-[4/5] w-full rounded-[1.15rem] object-cover"
                  />
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.2em] ${confidenceClass(match.confidence)}`}
                      >
                        {match.confidence}
                      </span>
                      <span className="glass-chip px-3 py-1 text-xs text-white">
                        {formatPercent(match.score)}
                      </span>
                      <a
                        href={match.externalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="admin-button-muted px-3 py-1.5 text-xs"
                      >
                        Post {match.postId}
                      </a>
                    </div>
                    <div className="grid gap-2 text-sm text-white/58 sm:grid-cols-2">
                      <p>
                        Visual{" "}
                        <span className="text-white/78">
                          {formatPercent(match.visualSimilarity)}
                        </span>
                      </p>
                      <p>
                        Aspect{" "}
                        <span className="text-white/78">
                          {formatPercent(match.aspectScore)}
                        </span>
                      </p>
                      <p>
                        Distance{" "}
                        <span className="text-white/78">{match.hammingDistance}</span>
                      </p>
                      <p>
                        Size{" "}
                        <span className="text-white/78">
                          {match.dimensions.furtrack.width ?? "?"}x
                          {match.dimensions.furtrack.height ?? "?"}
                        </span>
                      </p>
                    </div>
                    {match.tags.length ? (
                      <div className="flex flex-wrap gap-2">
                        {match.tags.slice(0, 12).map((tag) => (
                          <span
                            key={`${match.postId}:${tag.category}:${tag.name}`}
                            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/72"
                          >
                            <span className="text-white/40">{tag.category}</span>{" "}
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>

          {result.data.errors.length ? (
            <details className="muted-panel px-5 py-5">
              <summary className="cursor-pointer list-none text-sm text-white/72">
                Candidate errors
              </summary>
              <div className="mt-4 space-y-2 text-sm text-white/52">
                {result.data.errors.slice(0, 20).map((candidateError) => (
                  <p key={candidateError.postId}>
                    {candidateError.postId}: {candidateError.error}
                  </p>
                ))}
              </div>
            </details>
          ) : null}
        </section>
      ) : null}

      {result?.mode === "event" ? (
        <section className="space-y-5">
          <div className="muted-panel flex flex-wrap items-center justify-between gap-4 px-5 py-5">
            <div>
              <p className="text-sm font-medium text-white/88">
                {result.data.event.title}
              </p>
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-white/42">
                /e/{result.data.event.slug}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm text-white/58">
              <span className="glass-chip px-3 py-1.5">
                {result.data.searched.localPhotoCount} local photos
              </span>
              <span className="glass-chip px-3 py-1.5">
                {result.data.searched.totalCandidates} candidates
              </span>
              <span className="glass-chip px-3 py-1.5">
                {result.data.suggestions.length} suggestions
              </span>
              <span className="glass-chip px-3 py-1.5">
                {result.data.unmatchedPhotos.length} unmatched
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {result.data.suggestions.map((suggestion) => (
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
                          {suggestion.bestMatch.confidence}
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
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {result.data.unmatchedPhotos.length ? (
            <details className="muted-panel px-5 py-5">
              <summary className="cursor-pointer list-none text-sm text-white/72">
                Unmatched local photos
              </summary>
              <div className="mt-4 grid gap-2 text-sm text-white/52 sm:grid-cols-2">
                {result.data.unmatchedPhotos.slice(0, 40).map((photo) => (
                  <p key={photo.id}>
                    {photo.originalFilename} · best{" "}
                    {photo.bestScore === null ? "none" : formatPercent(photo.bestScore)}
                  </p>
                ))}
              </div>
            </details>
          ) : null}

          {result.data.errors.length ? (
            <details className="muted-panel px-5 py-5">
              <summary className="cursor-pointer list-none text-sm text-white/72">
                Candidate errors
              </summary>
              <div className="mt-4 space-y-2 text-sm text-white/52">
                {result.data.errors.slice(0, 20).map((candidateError) => (
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
