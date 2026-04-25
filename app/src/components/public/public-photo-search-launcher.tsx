/* eslint-disable @next/next/no-img-element */
"use client";

import { startTransition, useDeferredValue, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { getTagCategoryLabel, type TagCategoryValue } from "@/lib/tags";

type PublicPhotoSearchLauncherProps = {
  triggerClassName?: string;
  showLabel?: boolean;
};

type SearchResult = {
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
  matchedTags: Array<{
    id: string;
    name: string;
    slug: string;
    category: TagCategoryValue;
  }>;
  matchedTagSummary: string | null;
};

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function PublicPhotoSearchLauncher({
  triggerClassName,
  showLabel = false,
}: PublicPhotoSearchLauncherProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  // True only after a row is explicitly highlighted with the arrow keys.
  // Plain Enter opens the larger /search results page; arrow navigation +
  // Enter keeps the quick "open highlighted result" behavior.
  const [hasManuallySelected, setHasManuallySelected] = useState(false);
  const deferredQuery = useDeferredValue(query);

  const activeResult = results[activeIndex] ?? null;
  const triggerClasses =
    triggerClassName ??
    "floating-action inline-flex items-center justify-center gap-2 px-3.5 py-2.5 text-white/80 transition hover:bg-white/12";

  const resultCountLabel = useMemo(() => {
    if (!deferredQuery.trim()) {
      return null;
    }

    if (loading) {
      return "Searching public photographs...";
    }

    if (error) {
      return error;
    }

    if (!results.length) {
      return "No public photos match this combination yet.";
    }

    return `${results.length} matching photo${results.length === 1 ? "" : "s"}.`;
  }, [deferredQuery, error, loading, results.length]);

  function resetSearchState() {
    setQuery("");
    setResults([]);
    setError(null);
    setLoading(false);
    setActiveIndex(0);
    setHasManuallySelected(false);
  }

  function closeSearch() {
    resetSearchState();
    setOpen(false);
  }

  function navigateToResult(href: string) {
    resetSearchState();
    setOpen(false);
    startTransition(() => {
      router.push(href, { scroll: false });
    });
  }

  function navigateToResultsPage(rawQuery: string) {
    const trimmed = rawQuery.trim();
    if (!trimmed) {
      return;
    }

    const target = `/search?query=${encodeURIComponent(trimmed)}`;
    resetSearchState();
    setOpen(false);
    startTransition(() => {
      router.push(target, { scroll: false });
    });
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    inputRef.current?.focus();
    inputRef.current?.select();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const normalizedQuery = deferredQuery.trim();

    if (!normalizedQuery) {
      return;
    }

    const controller = new AbortController();
    const searchParams = new URLSearchParams({
      query: normalizedQuery,
      limit: "12",
    });

    fetch(`/api/search/photos?${searchParams.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          error?: string;
          results?: SearchResult[];
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to search photos.");
        }

        setResults(payload.results ?? []);
        setActiveIndex(0);
      })
      .catch((fetchError) => {
        if (controller.signal.aborted) {
          return;
        }

        console.error(fetchError);
        setResults([]);
        setError(
          fetchError instanceof Error ? fetchError.message : "Unable to search photos.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [deferredQuery, open]);

  const handleGlobalKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const searchShortcut = (event.key === "/" && !isTypingTarget(event.target)) || (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === "k"
    );

    if (searchShortcut) {
      event.preventDefault();
      setOpen(true);
      return;
    }

    if (event.key === "Escape" && open) {
      event.preventDefault();
      closeSearch();
    }
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => handleGlobalKeyDown(event);

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClasses}
        aria-label="Search archive"
      >
        <Search size={18} />
        {showLabel ? <span className="text-sm">Search</span> : null}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[80] bg-black/76 px-3 py-4 backdrop-blur-2xl sm:px-6 sm:py-8"
          onClick={() => closeSearch()}
        >
          <div
            className="solid-panel mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Search public photos"
          >
            <div className="border-b border-white/8 px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex items-center gap-3">
                <div className="glass-chip px-3 py-2 text-white/78">
                  <Search size={16} />
                  <span className="hidden text-xs uppercase tracking-[0.28em] sm:inline">
                    Search
                  </span>
                </div>
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => {
                    const nextQuery = event.target.value;
                    setQuery(nextQuery);
                    // Reset keyboard selection while typing so plain Enter
                    // opens the larger results page for the current query.
                    setHasManuallySelected(false);

                    if (!nextQuery.trim()) {
                      setResults([]);
                      setError(null);
                      setLoading(false);
                      setActiveIndex(0);
                      return;
                    }

                    setLoading(true);
                    setError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setActiveIndex((current) =>
                        results.length ? Math.min(results.length - 1, current + 1) : 0,
                      );
                      setHasManuallySelected(true);
                    }

                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setActiveIndex((current) => Math.max(0, current - 1));
                      setHasManuallySelected(true);
                    }

                    if (event.key === "Enter") {
                      event.preventDefault();
                      if (hasManuallySelected && activeResult) {
                        navigateToResult(activeResult.href);
                      } else if (query.trim()) {
                        navigateToResultsPage(query);
                      }
                    }
                  }}
                  className="min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-white/34 sm:text-lg"
                  placeholder="Search by character, event, year, species, maker, or general tag"
                />
                <button
                  type="button"
                  onClick={() => closeSearch()}
                  className="viewer-control shrink-0"
                  aria-label="Close search"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[0.68rem] uppercase tracking-[0.26em] text-white/42">
                <p>{resultCountLabel ?? ""}</p>
                <div className="flex items-center gap-3">
                  {query.trim() ? (
                    <button
                      type="button"
                      onClick={() => navigateToResultsPage(query)}
                      className="text-[0.68rem] uppercase tracking-[0.26em] text-white/72 transition hover:text-white"
                    >
                      See all results →
                    </button>
                  ) : null}
                  <p className="hidden text-white/34 sm:block">
                    Enter for full page · / or Ctrl+K · Esc dismisses
                  </p>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
              {!query.trim() ? (
                <div className="flex h-full min-h-56 items-center justify-center text-white/22">
                  <Search size={56} strokeWidth={1} />
                </div>
              ) : results.length ? (
                <div className="space-y-3">
                  {results.map((result, index) => {
                    const isActive = index === activeIndex;

                    return (
                      <button
                        key={result.id}
                        type="button"
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => navigateToResult(result.href)}
                        className={`grid w-full gap-4 rounded-[1.45rem] border px-3 py-3 text-left transition sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-5 sm:px-4 ${
                          isActive
                            ? "border-white/18 bg-white/8 shadow-[0_18px_50px_rgba(0,0,0,0.2)]"
                            : "border-white/8 bg-white/[0.03] hover:border-white/12 hover:bg-white/[0.06]"
                        }`}
                      >
                        <div
                          className="relative overflow-hidden rounded-[1rem] bg-[#101010]"
                          style={{
                            aspectRatio: `${result.previewWidth} / ${result.previewHeight}`,
                          }}
                        >
                          {result.previewUrl ? (
                            <img
                              src={result.previewUrl}
                              alt={result.altText ?? result.event.title}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="absolute inset-0 bg-[linear-gradient(145deg,_rgba(255,255,255,0.06),_rgba(255,255,255,0.02))]" />
                          )}
                          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_36%,_rgba(0,0,0,0.16)_100%)]" />
                        </div>

                        <div className="min-w-0 space-y-2">
                          <div className="space-y-1">
                            <p className="line-clamp-1 font-serif text-2xl tracking-[-0.03em] text-white sm:text-[1.75rem]">
                              {result.event.title}
                            </p>
                            <p className="text-[0.68rem] uppercase tracking-[0.28em] text-white/42">
                              {result.event.eventDateLabel}
                              {result.effectiveTakenAtLabel
                                ? ` · captured ${result.effectiveTakenAtLabel}`
                                : ""}
                            </p>
                          </div>

                          {result.subtitle ? (
                            <p className="line-clamp-2 text-sm leading-6 text-white/60">
                              {result.subtitle}
                            </p>
                          ) : null}

                          {result.matchedTagSummary ? (
                            <p className="line-clamp-2 text-sm text-white/54">
                              {result.matchedTagSummary}
                            </p>
                          ) : result.matchedTags.length ? (
                            <p className="line-clamp-2 text-sm text-white/54">
                              {result.matchedTags
                                .map(
                                  (tag) =>
                                    `${getTagCategoryLabel(tag.category)}: ${tag.name}`,
                                )
                                .join(" · ")}
                            </p>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="muted-panel flex h-full min-h-56 items-center justify-center px-6 text-center text-sm leading-7 text-white/54">
                  {loading
                    ? "Searching public photographs..."
                    : error ?? "No public photos match this combination yet."}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
