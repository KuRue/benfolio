/* eslint-disable @next/next/no-img-element */
"use client";

import {
  startTransition,
  type ReactNode,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";

import { ArrowLeft, ArrowRight, Download, Info, Link2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { buildTagSearchQuery, type TagCategoryValue } from "@/lib/tags";

type ViewerInfoRow = {
  label: string;
  value: string;
};

type ViewerTagGroup = {
  category: TagCategoryValue;
  label: string;
  tags: Array<{
    name: string;
    slug?: string;
  }>;
};

type ViewerFrame = {
  photoId: string;
  imageUrl: string | null;
  imageWidth: number;
  imageHeight: number;
  placeholderUrl: string | null;
  blurDataUrl: string | null;
  dominantColor: string | null;
  alt: string;
};

type NavigationPreview = {
  direction: 1 | -1;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
};

type PhotoViewerClientProps = {
  photoId: string;
  imageUrl: string | null;
  imageWidth: number;
  imageHeight: number;
  placeholderUrl: string | null;
  blurDataUrl: string | null;
  dominantColor: string | null;
  previousImageUrl: string | null;
  previousImageWidth: number | null;
  previousImageHeight: number | null;
  nextImageUrl: string | null;
  nextImageWidth: number | null;
  nextImageHeight: number | null;
  alt: string;
  title: string;
  subtitle: string;
  eventHref: string;
  downloadHref: string | null;
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

const viewerImageClass =
  "relative z-10 max-h-[calc(100dvh-0.65rem)] w-auto max-w-[calc(100vw-0.65rem)] object-contain transition-opacity duration-300 sm:max-h-[calc(100dvh-0.9rem)] sm:max-w-[calc(100vw-0.9rem)] lg:max-h-[calc(100dvh-1.8rem)] [@media(min-width:1024px)_and_(min-height:760px)]:max-h-[calc(100dvh-8rem)]";

const loadedViewerImageUrls = new Set<string>();

function rememberLoadedViewerImage(url: string | null | undefined) {
  if (url) {
    loadedViewerImageUrls.add(url);
  }
}

function ViewerFrameImage({
  frame,
  loaded,
  onImageRef,
  onLoad,
}: {
  frame: ViewerFrame;
  loaded: boolean;
  onImageRef?: (node: HTMLImageElement | null) => void;
  onLoad?: () => void;
}) {
  return (
    <div
      className="relative flex h-full w-full items-center justify-center"
      style={{ backgroundColor: frame.dominantColor ?? "#0c0c0c" }}
    >
      {frame.placeholderUrl ? (
        <img
          src={frame.placeholderUrl}
          alt=""
          aria-hidden
          decoding="async"
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
            loaded ? "opacity-0" : "opacity-24"
          }`}
        />
      ) : null}
      {frame.imageUrl ? (
        <img
          ref={onImageRef}
          src={frame.imageUrl}
          width={frame.imageWidth}
          height={frame.imageHeight}
          alt={frame.alt}
          decoding="async"
          fetchPriority="high"
          onLoad={onLoad}
          className={`${viewerImageClass} ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
        />
      ) : null}
    </div>
  );
}

function ViewerPhotoFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-[1.4rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.015))] p-1 shadow-[0_36px_120px_rgba(0,0,0,0.42)] lg:p-1.5">
      <div className="relative overflow-hidden rounded-[1.05rem] shadow-[0_24px_90px_rgba(0,0,0,0.36)]">
        {children}
      </div>
    </div>
  );
}

function ViewerPreviewImage({
  imageUrl,
  imageWidth,
  imageHeight,
  alt,
  dominantColor,
}: {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  alt: string;
  dominantColor: string | null;
}) {
  return (
    <div
      className="relative flex h-full w-full items-center justify-center"
      style={{ backgroundColor: dominantColor ?? "#0c0c0c" }}
    >
      <img
        src={imageUrl}
        width={imageWidth}
        height={imageHeight}
        alt={alt}
        aria-hidden
        decoding="async"
        className={viewerImageClass}
      />
    </div>
  );
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
                    <Link
                      key={`${group.category}:${tag.slug ?? tag.name}`}
                      href={`/search?query=${encodeURIComponent(
                        buildTagSearchQuery({
                          category: group.category,
                          name: tag.name,
                        }),
                      )}`}
                      className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs text-white/74 transition hover:border-[#8f73ff]/42 hover:bg-[#6f5cff]/16 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#8f73ff]/45"
                      aria-label={`Search ${group.label}: ${tag.name}`}
                    >
                      {tag.name}
                    </Link>
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
  photoId,
  imageUrl,
  imageWidth,
  imageHeight,
  placeholderUrl,
  blurDataUrl,
  dominantColor,
  previousImageUrl,
  previousImageWidth,
  previousImageHeight,
  nextImageUrl,
  nextImageWidth,
  nextImageHeight,
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
  const [touchLayout, setTouchLayout] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [sheetDragY, setSheetDragY] = useState(0);
  const [fullLoadedUrl, setFullLoadedUrl] = useState<string | null>(() =>
    imageUrl && loadedViewerImageUrls.has(imageUrl) ? imageUrl : null,
  );
  const [navigationPreview, setNavigationPreview] = useState<NavigationPreview | null>(null);
  const [navigationPreviewActive, setNavigationPreviewActive] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const sheetTouchStartY = useRef<number | null>(null);
  const controlsTimeoutRef = useRef<number | null>(null);
  const lastPhotoIdRef = useRef(photoId);
  const navigationTimeoutRef = useRef<number | null>(null);
  const navigationRafRef = useRef<number | null>(null);
  const currentFrame = useMemo<ViewerFrame>(
    () => ({
      photoId,
      imageUrl,
      imageWidth,
      imageHeight,
      placeholderUrl,
      blurDataUrl,
      dominantColor,
      alt,
    }),
    [
      alt,
      blurDataUrl,
      dominantColor,
      imageHeight,
      imageUrl,
      imageWidth,
      photoId,
      placeholderUrl,
    ],
  );
  const fullLoaded = Boolean(
    imageUrl &&
      (fullLoadedUrl === imageUrl || loadedViewerImageUrls.has(imageUrl)),
  );

  function markCurrentImageLoaded() {
    rememberLoadedViewerImage(imageUrl);
    setFullLoadedUrl(imageUrl);
  }

  // Ref callback instead of useRef because cached images can finish decoding
  // before React attaches its delegated load listener. Checking `.complete`
  // at commit time is the only reliable way to catch that case.
  const handleFullImageRef = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete && node.naturalWidth > 0) {
      rememberLoadedViewerImage(imageUrl);
      setFullLoadedUrl(imageUrl);
    }
  }, [imageUrl]);

  useEffect(() => {
    if (lastPhotoIdRef.current !== photoId) {
      lastPhotoIdRef.current = photoId;

      const resetFrame = window.requestAnimationFrame(() => {
        setNavigationPreview(null);
        setNavigationPreviewActive(false);
      });

      return () => {
        window.cancelAnimationFrame(resetFrame);
      };
    }
  }, [photoId]);

  useEffect(() => {
    return () => {
      if (navigationTimeoutRef.current) {
        window.clearTimeout(navigationTimeoutRef.current);
      }

      if (navigationRafRef.current) {
        window.cancelAnimationFrame(navigationRafRef.current);
      }
    };
  }, []);

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

  // Warm the browser cache for the neighbouring photos so swipe/arrow feels
  // instant. Plain `new Image()` is enough — these URLs are WebP served with
  // immutable cache headers, so when the user navigates the HTTP cache hits.
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    for (const url of [previousImageUrl, nextImageUrl]) {
      if (!url) {
        continue;
      }
      const preloader = new window.Image();
      preloader.decoding = "async";
      preloader.onload = () => {
        if (typeof preloader.decode !== "function") {
          rememberLoadedViewerImage(url);
          return;
        }

        preloader
          .decode()
          .then(() => rememberLoadedViewerImage(url))
          .catch(() => rememberLoadedViewerImage(url));
      };
      preloader.src = url;
    }
  }, [previousImageUrl, nextImageUrl]);

  useEffect(() => {
    if (!isModal) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverscroll = document.documentElement.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overscrollBehavior = previousHtmlOverscroll;
    };
  }, [isModal]);

  const runRouteNavigation = useCallback(
    (href: string) => {
      startTransition(() => {
        if (isModal) {
          router.replace(href, { scroll: false });
          return;
        }

        router.push(href, { scroll: false });
      });
    },
    [isModal, router],
  );

  function navigate(href: string | null) {
    if (!href || navigationPreview) {
      return;
    }

    revealControls();
    const direction = href === previousHref ? -1 : 1;
    const previewUrl = direction === -1 ? previousImageUrl : nextImageUrl;
    const previewWidth = direction === -1 ? previousImageWidth : nextImageWidth;
    const previewHeight = direction === -1 ? previousImageHeight : nextImageHeight;
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!previewUrl || !previewWidth || !previewHeight || reduceMotion) {
      runRouteNavigation(href);
      return;
    }

    if (navigationTimeoutRef.current) {
      window.clearTimeout(navigationTimeoutRef.current);
    }

    if (navigationRafRef.current) {
      window.cancelAnimationFrame(navigationRafRef.current);
    }

    setNavigationPreview({
      direction,
      imageUrl: previewUrl,
      imageWidth: previewWidth,
      imageHeight: previewHeight,
    });
    setNavigationPreviewActive(false);

    navigationRafRef.current = window.requestAnimationFrame(() => {
      navigationRafRef.current = window.requestAnimationFrame(() => {
        setNavigationPreviewActive(true);
      });
    });

    navigationTimeoutRef.current = window.setTimeout(() => {
      runRouteNavigation(href);
    }, 520);
  }

  const clearControlsTimeout = useCallback(() => {
    if (controlsTimeoutRef.current) {
      window.clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = null;
    }
  }, []);

  const scheduleHideControls = useCallback(() => {
    clearControlsTimeout();
    if (infoOpen) {
      return;
    }
    controlsTimeoutRef.current = window.setTimeout(() => {
      setControlsVisible(false);
    }, touchLayout ? 3200 : 2200);
  }, [clearControlsTimeout, infoOpen, touchLayout]);

  function revealControls() {
    setControlsVisible(true);
    scheduleHideControls();
  }

  function toggleInfoPanel() {
    setControlsVisible(true);
    setInfoOpen((current) => !current);
  }

  function handleClose() {
    const targetHref = closeHref ?? eventHref;

    startTransition(() => {
      if (isModal) {
        router.back();

        window.setTimeout(() => {
          if (window.location.pathname.startsWith("/p/")) {
            window.location.assign(targetHref);
          }
        }, 280);

        return;
      }

      router.push(targetHref, { scroll: false });
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
      return;
    }

    scheduleHideControls();

    return () => {
      clearControlsTimeout();
    };
  }, [clearControlsTimeout, infoOpen, scheduleHideControls]);

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

  const controlsLayer = (
    <div
      className={`pointer-events-none fixed inset-0 z-30 transition-opacity duration-300 ${
        controlsVisible || infoOpen ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="absolute right-3 top-3 pointer-events-auto flex items-center gap-1.5 rounded-full border border-white/10 bg-black/48 px-1.5 py-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.34)] backdrop-blur-2xl sm:right-4 sm:top-4">
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
          onClick={toggleInfoPanel}
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
        {downloadHref ? (
          <a
            href={downloadHref}
            className={viewerActionClass()}
            aria-label="Download original"
          >
            <Download size={18} />
          </a>
        ) : null}
      </div>

      {!touchLayout ? (
        <>
          <button
            type="button"
            onClick={() => navigate(previousHref)}
            disabled={!previousHref}
            className="glass-panel viewer-control pointer-events-auto absolute left-3 top-1/2 hidden -translate-y-1/2 lg:inline-flex xl:left-5 [@media(pointer:coarse)]:!hidden"
            aria-label="Previous photo"
          >
            <ArrowLeft size={18} />
          </button>
          <button
            type="button"
            onClick={() => navigate(nextHref)}
            disabled={!nextHref}
            className="glass-panel viewer-control pointer-events-auto absolute right-3 top-1/2 hidden -translate-y-1/2 lg:inline-flex xl:right-5 [@media(pointer:coarse)]:!hidden"
            aria-label="Next photo"
          >
            <ArrowRight size={18} />
          </button>
        </>
      ) : null}
    </div>
  );

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

        {controlsLayer}

        <div
          className={`relative z-10 flex h-[100dvh] flex-1 items-center justify-center overflow-hidden px-2 py-2 sm:px-4 sm:py-4 lg:px-6 lg:py-6 [@media(min-width:1024px)_and_(min-height:760px)]:py-16 ${
            !touchLayout && infoOpen ? "lg:pr-[27rem] xl:pr-[29rem]" : ""
          }`}
          onClick={() => {
            if (touchLayout) {
              revealControls();
            }
          }}
        >
          {imageUrl ? (
            <div className="relative h-full w-full overflow-hidden">
                {navigationPreview ? (
                  <div
                    className="absolute inset-0 z-10 flex items-center justify-center transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:hidden"
                    style={{
                      transform: navigationPreviewActive
                        ? "translateX(0)"
                        : `translateX(${navigationPreview.direction * 112}%)`,
                    }}
                    aria-hidden
                  >
                    <ViewerPhotoFrame>
                      <ViewerPreviewImage
                        imageUrl={navigationPreview.imageUrl}
                        imageWidth={navigationPreview.imageWidth}
                        imageHeight={navigationPreview.imageHeight}
                        alt={alt}
                        dominantColor={dominantColor}
                      />
                    </ViewerPhotoFrame>
                  </div>
                ) : null}
                <div
                  className="absolute inset-0 z-20 flex items-center justify-center transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transform-none motion-reduce:transition-none"
                  style={{
                    transform: navigationPreview
                      ? navigationPreviewActive
                        ? `translateX(${-navigationPreview.direction * 112}%)`
                        : "translateX(0)"
                      : "translateX(0)",
                  }}
                >
                  <ViewerPhotoFrame>
                    <ViewerFrameImage
                      frame={currentFrame}
                      loaded={fullLoaded}
                      onImageRef={handleFullImageRef}
                      onLoad={markCurrentImageLoaded}
                    />
                  </ViewerPhotoFrame>
                </div>
            </div>
          ) : (
            <div className="muted-panel relative min-h-72 px-8 py-10 text-sm text-white/55">
              <div className="flex h-full min-h-56 items-center justify-center">
                This photograph is still being processed.
              </div>
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
              className={`fixed inset-x-0 bottom-0 z-40 rounded-t-[1.8rem] border-t border-white/10 bg-[#090909]/96 px-4 pb-6 pt-2 shadow-[0_-24px_80px_rgba(0,0,0,0.4)] backdrop-blur-2xl ${
                sheetDragY === 0 ? "transition-transform duration-300" : ""
              }`}
              style={{
                transform: infoOpen
                  ? `translateY(${sheetDragY}px)`
                  : "translateY(100%)",
              }}
            >
              <div
                className="flex cursor-grab touch-none justify-center py-3 active:cursor-grabbing"
                onTouchStart={(event) => {
                  sheetTouchStartY.current = event.touches[0]?.clientY ?? null;
                }}
                onTouchMove={(event) => {
                  if (sheetTouchStartY.current === null) {
                    return;
                  }
                  const currentY = event.touches[0]?.clientY ?? null;
                  if (currentY === null) {
                    return;
                  }
                  const delta = currentY - sheetTouchStartY.current;
                  setSheetDragY(delta > 0 ? delta : 0);
                }}
                onTouchEnd={() => {
                  if (sheetDragY > 80) {
                    setInfoOpen(false);
                  }
                  setSheetDragY(0);
                  sheetTouchStartY.current = null;
                }}
                onTouchCancel={() => {
                  setSheetDragY(0);
                  sheetTouchStartY.current = null;
                }}
              >
                <div className="h-1.5 w-12 rounded-full bg-white/22" />
              </div>
              <div className="max-h-[60vh] overflow-y-auto px-1 [overscroll-behavior:contain]">
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
