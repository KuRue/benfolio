import type { Metadata } from "next";

import { Calendar, ImageIcon, MapPin } from "lucide-react";
import { notFound } from "next/navigation";

import { BlurUpImage } from "@/components/public/blur-up-image";
import { PhotoGrid } from "@/components/public/photo-grid";
import { PublicSiteMark } from "@/components/public/public-site-mark";
import { PublicPhotoSearchLauncher } from "@/components/public/public-photo-search-launcher";
import { getResolvedRuntimeSettings } from "@/lib/app-settings";
import {
  buildTransformedImageUrl,
  buildTransformedSrcSet,
  gravityFromFocal,
} from "@/lib/cf-images";
import { getPublicEventBySlug, getSiteProfile } from "@/lib/gallery";
import { absoluteUrl, formatDateRange } from "@/lib/strings";
import { buildDisplayUrl } from "@/lib/storage";

// Matches SiteHeader — same edge-to-edge hero ratio, same cache pool.
const HERO_WIDTHS = [960, 1440, 1920];
const HERO_SIZES = "100vw";

export const dynamic = "force-dynamic";

type EventPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({
  params,
}: EventPageProps): Promise<Metadata> {
  const { slug } = await params;
  const event = await getPublicEventBySlug(slug);

  if (!event) {
    return {
      title: "Event not found",
    };
  }

  const image = buildDisplayUrl(event.coverDisplayKey);
  const description =
    event.description ??
    `A curated event gallery from ${formatDateRange(event.eventDate, event.eventEndDate)}.`;
  const ogImages = image ? [{ url: absoluteUrl(image) }] : undefined;

  return {
    title: event.title,
    description,
    alternates: {
      canonical: `/e/${event.slug}`,
    },
    robots:
      event.visibility === "HIDDEN"
        ? {
            index: false,
            follow: false,
          }
        : undefined,
    openGraph: {
      type: "article",
      title: event.title,
      description,
      url: absoluteUrl(`/e/${event.slug}`),
      images: ogImages,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: event.title,
      description,
      images: ogImages,
    },
  };
}

export default async function EventPage({ params }: EventPageProps) {
  const { slug } = await params;
  const [event, siteProfile, runtimeSettings] = await Promise.all([
    getPublicEventBySlug(slug),
    getSiteProfile(),
    getResolvedRuntimeSettings(),
  ]);

  if (!event) {
    notFound();
  }

  const plainCoverUrl = buildDisplayUrl(event.coverDisplayKey);
  const coverPosition = `${event.coverFocalX ?? 50}% ${event.coverFocalY ?? 50}%`;
  const cfEnabled = runtimeSettings.cfImagesEnabled;
  const coverTransformOptions = {
    fit: "cover" as const,
    quality: 82,
    gravity: gravityFromFocal(event.coverFocalX, event.coverFocalY),
  };
  const transformedCover = buildTransformedImageUrl(
    event.coverDisplayKey,
    cfEnabled,
    {
      ...coverTransformOptions,
      width: Math.max(...HERO_WIDTHS),
    },
  );
  const coverSrcSet = buildTransformedSrcSet(
    event.coverDisplayKey,
    cfEnabled,
    HERO_WIDTHS,
    coverTransformOptions,
  );
  const coverUrl = transformedCover ?? plainCoverUrl;
  const photoCountLabel = String(event.photos.length);
  const dateLabel = formatDateRange(event.eventDate, event.eventEndDate, "short");

  return (
    <main className="pb-16">
      <section className="relative left-1/2 isolate min-h-[20rem] w-screen -translate-x-1/2 overflow-hidden bg-[#050505] sm:min-h-[23rem] lg:min-h-[27rem]">
        {coverUrl ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[82%] opacity-[0.98]">
            <BlurUpImage
              src={coverUrl}
              srcSet={coverSrcSet}
              sizes={HERO_SIZES}
              alt=""
              blurDataUrl={event.coverBlurDataUrl}
              dominantColor={event.coverDominantColor}
              objectPosition={coverPosition}
              imgClassName="brightness-[1.05] contrast-[1.05] saturate-[1.04]"
            />
          </div>
        ) : (
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[82%] bg-[radial-gradient(circle_at_top_left,_rgba(197,146,92,0.26),_transparent_36%),linear-gradient(135deg,_#151515_0%,_#0b0b0b_48%,_#1a1a1a_100%)]" />
        )}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(197,150,92,0.12),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(255,255,255,0.08),_transparent_24%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_32%,_rgba(0,0,0,0.28)_100%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[82%] bg-gradient-to-b from-black/28 via-transparent via-[54%] to-[#050505]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[56%] bg-gradient-to-t from-[#050505] via-[#050505]/94 via-[44%] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 left-0 w-[64%] bg-gradient-to-r from-black/42 via-black/22 to-transparent" />

        {runtimeSettings.logoMarkEnabled ? (
          <div className="absolute left-4 top-4 z-20 sm:left-5 sm:top-5">
            <PublicSiteMark
              displayName={siteProfile.displayName}
              logoDisplayKey={siteProfile.logoDisplayKey}
            />
          </div>
        ) : null}
        {runtimeSettings.publicSearchEnabled ? (
          <div className="absolute right-4 top-4 z-20 sm:right-5 sm:top-5">
            <PublicPhotoSearchLauncher
              triggerClassName="floating-action inline-flex h-[3.25rem] w-[3.25rem] items-center justify-center rounded-full bg-black/38 text-white/78 transition hover:bg-white/12 hover:text-white sm:h-14 sm:w-14"
            />
          </div>
        ) : null}

        <div className="relative z-10 mx-auto flex min-h-[20rem] w-[min(100%-1.25rem,110rem)] flex-col justify-end pb-5 pt-20 sm:min-h-[23rem] sm:w-[min(100%-2rem,110rem)] sm:pb-6 lg:min-h-[27rem] lg:pb-8">
          <div className="max-w-4xl space-y-3">
            {event.kicker ? (
              <p className="text-[0.74rem] font-semibold uppercase tracking-[0.26em] text-[#9c8cff] [text-shadow:_0_1px_16px_rgba(0,0,0,0.76),_0_0_18px_rgba(126,107,255,0.38)] sm:text-[0.82rem]">
                {event.kicker}
              </p>
            ) : null}
            <h1 className="text-balance font-serif text-[3rem] leading-[0.9] tracking-[-0.055em] text-white [text-shadow:_0_4px_30px_rgba(0,0,0,0.62)] sm:text-[4.2rem] lg:text-[5.35rem]">
              {event.title}
            </h1>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="glass-chip px-3 py-2 text-sm text-white/84 sm:px-3.5">
                <Calendar className="h-[15px] w-[15px]" />
                {dateLabel}
              </span>
              <span className="glass-chip px-3 py-2 text-sm text-white/84 sm:px-3.5">
                <ImageIcon className="h-[15px] w-[15px]" />
                {photoCountLabel}
              </span>
              {event.location ? (
                <span className="glass-chip px-3 py-2 text-sm text-white/84 sm:px-3.5">
                  <MapPin className="h-[15px] w-[15px]" />
                  {event.location}
                </span>
              ) : null}
            </div>
            {event.description ? (
              <p className="max-w-2xl overflow-hidden text-pretty text-sm leading-6 text-white/70 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [text-shadow:_0_1px_14px_rgba(0,0,0,0.55)] sm:text-[0.98rem] sm:leading-7">
                {event.description}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <div className="mx-auto -mt-1 flex w-[min(100%-0.75rem,110rem)] flex-col gap-3 sm:w-[min(100%-1.25rem,110rem)] sm:gap-4">
        <section className="relative z-10">
          <PhotoGrid photos={event.photos} returnHref={`/e/${event.slug}`} />
        </section>
      </div>
    </main>
  );
}
