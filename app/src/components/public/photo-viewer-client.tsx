/* eslint-disable @next/next/no-img-element */
"use client";

import {
  startTransition,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

import { ArrowLeft, ArrowRight, Download, Info, Link2, X } from "lucide-react";
import { useRouter } from "next/navigation";

type ViewerInfoRow = {
  label: string;
  value: string;
};

type ViewerTagGroup = {
  category: string;
  label: string;
  tags: Array<{
    name: string;
    slug?: string;
  }>;
};

type PhotoViewerClientProps = {
  imageUrl: string | null;
  imageWidth: number;
  imageHeight: number;
  alt: string;
  title: string;
  subtitle: string;
  eventHref: string;
  downloadHref: string;
  previousHref: string | null;
  nextHref: string | null;
  closeHref?: string;
  infoRows: ViewerInfoRow[];
  tagGroups: ViewerTagGroup[];
  isModal?: boolean;
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

function viewerActionClass(active = false) {
  return `viewer-control ${active ? "border-white/18 bg-white text-black shadow-[0_16px_34px_rgba(255,255,255,0.14)]" : ""}`;
}

function DetailsPanel({
  title,
  subtitle,
  eventHref,
  infoRows,
  tagGroups,
}: {
  title: string;
  subtitle: string;
  eventHref: string;
  infoRows: ViewerInfoRow[];
  tagGroups: ViewerTagGroup[];
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <a
          href={eventHref}
          className="text-[0.68rem] uppercase tracking-[0.3em] text-white/42 transition hover:text-white/74"
        >
          Open event
        </a>
        <div className="space-y-2">
          <h1 className="font-serif text-[1.8rem] leading-none tracking-[-0.04em] text-white sm:text-[2rem]">
            {title}
          </h1>
          {subtitle ? (
            <p className="text-sm leading-6 text-white/58">{subtitle}</p>
          ) : null}
        </div>
      </div>

      <dl className="space-y-4 border-t border-white/8 pt-5">
        {infoRows.map((row) => (
          <div key={row.label} className="space-y-1">
            <dt className="text-[0.68rem] uppercase tracking-[0.28em] text-white/42">
              {row.label}
            </dt>
            <dd className="text-sm text-white/74">{row.value}</dd>
          </div>
        ))}
      </dl>

      {tagGroups.length ? (
        <div className="space-y-3 border-t border-white/8 pt-5">
          <p className="text-[0.68rem] uppercase tracking-[0.28em] text-white/42">
            Tags
          </p>
          <div className="space-y-3">
            {tagGroups.map((group) => (
              <div
                key={group.category}
                className="rounded-[1.15rem] border border-white/8 bg-white/[0.03] px-3 py-3"
              >
                <p className="text-[0.68rem] uppercase tracking-[0.24em] text-white/34">
                  {group.label}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {group.tags.map((tag) => (
                    <span
                      key={`${group.category}:${tag.slug ?? tag.name}`}
                      className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs text-white/74"
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PhotoViewerClient({
  imageUrl,
  imageWidth,
  imageHeight,
  alt,
  title,
  subtitle,
  eventHref,
  downloadHref,
  previousHref,
  nextHref,
  closeHref,
  infoRows,
  tagGroups,
  isModal = false,
}: PhotoViewerClientProps) {
  const router = useRouter();
  const [shareState, setShareState] = useState<"idle" | "copied" | "shared">("idle");
  const [infoOpen, setInfoOpen] = useState(false);
  const [touchLayout, setTouchLayout] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const touchStartX = useRef<number | null>(null);
  const controlsTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1023px), (pointer: coarse)");
    const syncLayout = () => setTouchLayout(mediaQuery.matches);

    syncLayout();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncLayout);
      return () => mediaQuery.removeEventListener("change", syncLayout);
    }

    mediaQuery.addListener(syncLayout);
    return () => mediaQuery.removeListener(syncLayout);
  }, []);

  useEffect(() => {
    for (const href of [closeHref, eventHref, previousHref, nextHref]) {
      if (href) {
        router.prefetch(href);
      }
    }
  }, [closeHref, eventHref, nextHref, previousHref, router]);

  function navigate(href: string | null) {
    if (!href) {
      return;
    }

    revealControls();

    startTransition(() => {
      if (isModal) {
        router.replace(href, { scroll: false });
        return;
      }

      router.push(href, { scroll: false });
    });
  }

  function clearControlsTimeout() {
    if (controlsTimeoutRef.current) {
      window.clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = null;
    }
  }

  const scheduleHideControls = useEffectEvent(() => {
    clearControlsTimeout();
    if (infoOpen) {
      return;
    }
    controlsTimeoutRef.current = window.setTimeout(() => {
      setControlsVisible(false);
    }, touchLayout ? 5000 : 4000);
  });

  function revealControls() {
    setControlsVisible(true);
    scheduleHideControls();
  }

  function handleClose() {
    startTransition(() => {
      // In modal mode (intercepted @modal/(.)p/[id] route), router.back() is the only
      // thing that actually unmounts the parallel slot. router.replace updates the URL
      // but leaves the modal painted. Fall through to closeHref/eventHref only when
      // there's no history to pop (deep link / refreshed modal).
      if (isModal && window.history.length > 1) {
        router.back();
        return;
      }

      if (closeHref) {
        router.replace(closeHref, { scroll: false });
        return;
      }

      router.push(eventHref, { scroll: false });
    });
  }

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (isTypingTarget(event.target)) {
      return;
    }

    if (event.key === "ArrowLeft") {
      navigate(previousHref);
    }

    if (event.key === "ArrowRight") {
      navigate(nextHref);
    }

    if (event.key === "Escape") {
      if (infoOpen) {
        setInfoOpen(false);
        return;
      }

      if (isModal) {
        handleClose();
      }
    }
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => handleKeyDown(event);

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (infoOpen) {
      clearControlsTimeout();
      setControlsVisible(true);
      return;
    }

    scheduleHideControls();

    return () => {
      clearControlsTimeout();
    };
  }, [infoOpen]);

  async function handleShare() {
    if (typeof navigator === "undefined") {
      return;
    }

    const shareUrl = window.location.href;

    try {
      if (navigator.share) {
        await navigator.share({
          title,
          text: subtitle || title,
          url: shareUrl,
        });
        setShareState("shared");
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setShareState("copied");
      }

      window.setTimeout(() => setShareState("idle"), 1800);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      throw error;
    }
  }

  return (
    <div
      className={
        isModal
          ? "fixed inset-0 z-50 h-[100dvh] overflow-hidden bg-[rgba(3,3,3,0.82)] backdrop-blur-xl"
          : "h-[100dvh] overflow-hidden bg-[#050505]"
      }
      onTouchStart={(event) => {
        touchStartX.current = event.changedTouches[0]?.clientX ?? null;
        revealControls();
      }}
      onTouchEnd={(event) => {
        if (infoOpen || !touchLayout) {
          return;
        }

        const endX = event.changedTouches[0]?.clientX ?? null;
        const startX = touchStartX.current;

        if (startX == null || endX == null) {
          return;
        }

        const delta = endX - startX;

        if (Math.abs(delta) < 60) {
          return;
        }

        if (delta > 0) {
          navigate(previousHref);
        } else {
          navigate(nextHref);
        }
      }}
      onMouseMove={() => {
        if (!touchLayout) {
          revealControls();
        }
      }}
    >
      <div className="relative flex h-[100dvh] w-full overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.04),_transparent_30%),radial-gradient(circle_at_center,_rgba(197,150,92,0.07),_transparent_62%)]" />

        {shareState !== "idle" ? (
          <div className="pointer-events-none fixed inset-x-0 top-16 z-30 flex justify-center px-3 sm:top-[4.75rem]">
            <div className="rounded-full border border-white/10 bg-black/50 px-3 py-1.5 text-[0.68rem] uppercase tracking-[0.28em] text-[#f0d0aa] backdrop-blur-xl">
              {shareState === "copied" ? "Link copied" : "Share sheet opened"}
            </div>
          </div>
        ) : null}

        <div
          className={`relative z-10 flex h-[100dvh] flex-1 items-center justify-center overflow-hidden px-2 py-2 sm:px-4 sm:py-4 lg:px-6 lg:py-6 ${
            !touchLayout && infoOpen ? "lg:pr-[27rem] xl:pr-[29rem]" : ""
          }`}
          onClick={() => {
            if (touchLayout) {
              revealControls();
            }
          }}
        >
          <div
            className={`pointer-events-none absolute inset-0 z-20 transition-opacity duration-300 ${
              controlsVisible || infoOpen ? "opacity-100" : "opacity-0"
            }`}
          >
            <div className="absolute inset-x-0 top-0 flex justify-end px-3 pt-3 sm:px-4 sm:pt-4">
              <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-white/10 bg-black/42 px-1.5 py-1.5 backdrop-blur-2xl shadow-[0_20px_60px_rgba(0,0,0,0.34)]">
                <button
                  type="button"
                  onClick={handleClose}
                  className={viewerActionClass()}
                  aria-label={isModal ? "Close viewer" : "Back to event"}
                >
                  {isModal ? <X size={18} /> : <ArrowLeft size={18} />}
                </button>
                <button
                  type="button"
                  onClick={() => setInfoOpen((current) => !current)}
                  className={viewerActionClass(infoOpen)}
                  aria-label={touchLayout ? "Toggle details sheet" : "Toggle details panel"}
                  aria-pressed={infoOpen}
                >
                  <Info size={18} />
                </button>
                <button
                  type="button"
                  onClick={handleShare}
                  className={viewerActionClass(shareState !== "idle")}
                  aria-label="Share photo"
                >
                  <Link2 size={18} />
                </button>
                <a
                  href={downloadHref}
                  className={viewerActionClass()}
                  aria-label="Download original"
                >
                  <Download size={18} />
                </a>
              </div>
            </div>

            {!touchLayout ? (
              <>
                <button
                  type="button"
                  onClick={() => navigate(previousHref)}
                  disabled={!previousHref}
                  className="glass-panel viewer-control pointer-events-auto absolute left-4 top-1/2 hidden -translate-y-1/2 lg:inline-flex"
                  aria-label="Previous photo"
                >
                  <ArrowLeft size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => navigate(nextHref)}
                  disabled={!nextHref}
                  className="glass-panel viewer-control pointer-events-auto absolute right-4 top-1/2 hidden -translate-y-1/2 lg:inline-flex"
                  aria-label="Next photo"
                >
                  <ArrowRight size={18} />
                </button>
              </>
            ) : null}
          </div>

          {imageUrl ? (
            <div className="relative flex max-h-[calc(100dvh-0.5rem)] max-w-[calc(100vw-0.5rem)] items-center justify-center rounded-[1.4rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.015))] p-1 shadow-[0_36px_120px_rgba(0,0,0,0.42)] sm:max-h-[calc(100dvh-1rem)] sm:max-w-[calc(100vw-1rem)] lg:p-1.5">
              <img
                src={imageUrl}
                width={imageWidth}
                height={imageHeight}
                alt={alt}
                className="max-h-[calc(100dvh-0.7rem)] w-auto max-w-[calc(100vw-0.7rem)] rounded-[1.05rem] object-contain shadow-[0_24px_90px_rgba(0,0,0,0.36)] sm:max-h-[calc(100dvh-1.2rem)] sm:max-w-[calc(100vw-1.2rem)] lg:max-h-[calc(100dvh-0.9rem)]"
              />
            </div>
          ) : (
            <div className="muted-panel px-8 py-10 text-sm text-white/55">
              This photograph is still being processed.
            </div>
          )}
        </div>

        {!touchLayout ? (
          <>
            <div
              className={`fixed inset-0 z-20 bg-black/26 transition-opacity duration-200 ${
                infoOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
              }`}
              onClick={() => setInfoOpen(false)}
            />
            <aside
              className={`fixed inset-y-0 right-0 z-40 w-[24rem] max-w-[92vw] border-l border-white/10 bg-[#070707]/94 px-5 py-24 backdrop-blur-2xl transition-transform duration-300 xl:w-[26rem] ${
                infoOpen ? "translate-x-0" : "translate-x-full"
              }`}
            >
              <div className="muted-panel h-full overflow-y-auto px-5 py-5">
                <DetailsPanel
                  title={title}
                  subtitle={subtitle}
                  eventHref={eventHref}
                  infoRows={infoRows}
                  tagGroups={tagGroups}
                />
              </div>
            </aside>
          </>
        ) : (
          <>
            <div
              className={`fixed inset-0 z-30 bg-black/36 transition-opacity duration-200 ${
                infoOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
              }`}
              onClick={() => setInfoOpen(false)}
            />
            <div
              className={`fixed inset-x-0 bottom-0 z-40 rounded-t-[1.8rem] border-t border-white/10 bg-[#090909]/96 px-4 pb-6 pt-4 shadow-[0_-24px_80px_rgba(0,0,0,0.4)] backdrop-blur-2xl transition-transform duration-300 ${
                infoOpen ? "translate-y-0" : "translate-y-full"
              }`}
            >
              <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/14" />
              <div className="max-h-[60vh] overflow-y-auto px-1">
                <DetailsPanel
                  title={title}
                  subtitle={subtitle}
                  eventHref={eventHref}
                  infoRows={infoRows}
                  tagGroups={tagGroups}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
