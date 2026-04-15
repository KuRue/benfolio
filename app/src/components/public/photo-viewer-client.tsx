/* eslint-disable @next/next/no-img-element */
"use client";

import { startTransition, useEffect, useEffectEvent, useRef, useState } from "react";

import { ArrowLeft, ArrowRight, Download, Info, Link2, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { PublicPhotoSearchLauncher } from "@/components/public/public-photo-search-launcher";

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
  const touchStartX = useRef<number | null>(null);

  function navigate(href: string | null) {
    if (!href) {
      return;
    }

    startTransition(() => {
      router.push(href, { scroll: false });
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

    if (event.key === "Escape" && isModal) {
      router.back();
    }
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => handleKeyDown(event);

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function handleShare() {
    if (typeof navigator === "undefined") {
      return;
    }

    const shareUrl = window.location.href;

    if (navigator.share) {
      await navigator.share({
        title,
        text: subtitle,
        url: shareUrl,
      });
      setShareState("shared");
      return;
    }

    await navigator.clipboard.writeText(shareUrl);
    setShareState("copied");
    window.setTimeout(() => setShareState("idle"), 1800);
  }

  function handleClose() {
    if (isModal) {
      router.back();
      return;
    }

    if (closeHref) {
      router.push(closeHref);
    }
  }

  return (
    <div
      className={
        isModal
          ? "fixed inset-0 z-50 flex bg-black/85 backdrop-blur-2xl"
          : "min-h-screen bg-[#050505]"
      }
      onTouchStart={(event) => {
        touchStartX.current = event.changedTouches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
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
    >
      <div className="flex min-h-screen w-full flex-col">
        <div className="pointer-events-none fixed inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-4 sm:p-6">
          <div className="glass-panel pointer-events-auto flex items-center gap-2 rounded-full px-2 py-2">
            <button
              type="button"
              onClick={handleClose}
              className="viewer-control"
              aria-label={isModal ? "Close viewer" : "Back to event"}
            >
              {isModal ? <X size={18} /> : <ArrowLeft size={18} />}
            </button>
            <button
              type="button"
              onClick={() => navigate(previousHref)}
              disabled={!previousHref}
              className="viewer-control"
              aria-label="Previous photo"
            >
              <ArrowLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => navigate(nextHref)}
              disabled={!nextHref}
              className="viewer-control"
              aria-label="Next photo"
            >
              <ArrowRight size={18} />
            </button>
          </div>

          <div className="glass-panel pointer-events-auto flex items-center gap-2 rounded-full px-2 py-2">
            <PublicPhotoSearchLauncher triggerClassName="viewer-control" />
            <button
              type="button"
              onClick={handleShare}
              className="viewer-control"
              aria-label="Share photo"
            >
              <Link2 size={18} />
            </button>
            <button
              type="button"
              onClick={() => setInfoOpen((current) => !current)}
              className="viewer-control"
              aria-label="Toggle photo details"
            >
              <Info size={18} />
            </button>
            <a href={downloadHref} className="viewer-control" aria-label="Download original">
              <Download size={18} />
            </a>
          </div>
        </div>

        <div className="grid min-h-screen flex-1 items-stretch lg:grid-cols-[1fr,24rem]">
          <div className="flex min-h-screen items-center justify-center px-3 pb-28 pt-24 sm:px-6 lg:px-10">
            {imageUrl ? (
              <img
                src={imageUrl}
                width={imageWidth}
                height={imageHeight}
                alt={alt}
                className="max-h-[78vh] w-auto max-w-full rounded-[1.6rem] object-contain shadow-[0_36px_120px_rgba(0,0,0,0.45)]"
              />
            ) : (
              <div className="rounded-[1.6rem] border border-white/10 bg-white/5 px-8 py-10 text-sm text-white/55">
                This photograph is still being processed.
              </div>
            )}
          </div>

          <aside
            className={`fixed inset-y-0 right-0 z-20 w-[20rem] max-w-[92vw] border-l border-white/10 bg-black/80 px-5 py-24 backdrop-blur-2xl transition-transform duration-300 lg:static lg:w-auto lg:translate-x-0 lg:border-l lg:bg-white/5 lg:px-6 lg:py-28 ${
              infoOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
            }`}
          >
            <div className="space-y-6">
              <div className="space-y-3">
                <a
                  href={eventHref}
                  className="text-[0.68rem] uppercase tracking-[0.34em] text-white/46"
                >
                  Return to event
                </a>
                <h1 className="font-serif text-3xl leading-none tracking-[-0.03em] text-white">
                  {title}
                </h1>
                <p className="text-sm leading-7 text-white/60">{subtitle}</p>
                {shareState !== "idle" ? (
                  <p className="text-xs uppercase tracking-[0.28em] text-[#c5965c]">
                    {shareState === "copied" ? "Link copied" : "Share sheet opened"}
                  </p>
                ) : null}
              </div>

              <dl className="space-y-4 border-t border-white/8 pt-6">
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
                <div className="space-y-3 border-t border-white/8 pt-6">
                  <p className="text-[0.68rem] uppercase tracking-[0.28em] text-white/42">
                    Tags
                  </p>
                  <div className="space-y-3">
                    {tagGroups.map((group) => (
                      <div key={group.category} className="space-y-2">
                        <p className="text-[0.68rem] uppercase tracking-[0.24em] text-white/34">
                          {group.label}
                        </p>
                        <div className="flex flex-wrap gap-2">
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
          </aside>
        </div>
      </div>
    </div>
  );
}
