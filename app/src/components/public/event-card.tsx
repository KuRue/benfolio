import Link from "next/link";
import { ArrowRight, Calendar, ImageIcon, MapPin } from "lucide-react";

import { BlurUpImage } from "@/components/public/blur-up-image";
import {
  buildTransformedImageUrl,
  buildTransformedSrcSet,
  gravityFromFocal,
} from "@/lib/cf-images";
import { formatDateRange } from "@/lib/strings";
import { buildDisplayUrl } from "@/lib/storage";

type EventCardProps = {
  event: {
    title: string;
    kicker: string | null;
    slug: string;
    eventDate: Date;
    eventEndDate: Date | null;
    location: string | null;
    description: string | null;
    coverDisplayKey: string | null;
    coverFocalX: number | null;
    coverFocalY: number | null;
    coverBlurDataUrl?: string | null;
    coverDominantColor?: string | null;
    _count: {
      photos: number;
    };
  };
  /** Resolved from `cfImagesEnabled` runtime setting by the caller. */
  cfEnabled: boolean;
};

// Cloudflare transformations: 3 widths cover mobile → xl grid
// columns (~22rem max). ~3 transforms per unique event cover per
// month, cached after that.
const GRID_WIDTHS = [480, 720, 960];
const GRID_SIZES = "(min-width: 1280px) 22rem, (min-width: 640px) 40vw, 100vw";

export function EventCard({ event, cfEnabled }: EventCardProps) {
  const plainCoverUrl = buildDisplayUrl(event.coverDisplayKey);
  const coverPosition = `${event.coverFocalX ?? 50}% ${event.coverFocalY ?? 50}%`;
  const transformOptions = {
    fit: "cover" as const,
    quality: 82,
    gravity: gravityFromFocal(event.coverFocalX, event.coverFocalY),
  };
  const transformedCover = buildTransformedImageUrl(
    event.coverDisplayKey,
    cfEnabled,
    {
      ...transformOptions,
      width: Math.max(...GRID_WIDTHS),
    },
  );
  const coverSrcSet = buildTransformedSrcSet(
    event.coverDisplayKey,
    cfEnabled,
    GRID_WIDTHS,
    transformOptions,
  );
  const coverUrl = transformedCover ?? plainCoverUrl;
  const photoCountLabel = `${event._count.photos} Photo${
    event._count.photos === 1 ? "" : "s"
  }`;

  return (
    <Link
      href={`/e/${event.slug}`}
      className="group relative flex flex-col overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#0a0a0a] shadow-[0_18px_56px_rgba(0,0,0,0.24)] transition duration-300 hover:-translate-y-0.5 hover:border-white/16 hover:shadow-[0_28px_84px_rgba(0,0,0,0.34)]"
    >
      {/* Image region — large hero. Keeps the photo the hero of the
          card; metadata lives in the dark panel below rather than
          being overlaid on top of the photograph. */}
      <div className="relative aspect-[4/5] overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(197,146,92,0.22),_transparent_32%),linear-gradient(145deg,_#111,_#050505)]">
        {coverUrl ? (
          <BlurUpImage
            src={coverUrl}
            srcSet={coverSrcSet}
            sizes={GRID_SIZES}
            alt=""
            blurDataUrl={event.coverBlurDataUrl}
            dominantColor={event.coverDominantColor}
            objectPosition={coverPosition}
            imgClassName="transition duration-700 group-hover:scale-[1.03] group-hover:saturate-[1.03]"
          />
        ) : null}
        {/* Bottom fade into the info panel for a seamless transition. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/68 to-transparent" />
      </div>

      {/* Info panel — editorial stack: kicker, title, metadata pill
          chips, then a prominent CTA mirroring the in-bio link on the
          site header. */}
      <div className="flex flex-col gap-3 px-5 pb-5 pt-4 sm:px-6 sm:pb-6 sm:pt-5">
        {event.kicker ? (
          <p className="text-[0.68rem] font-medium uppercase tracking-[0.3em] text-[#c5965c]">
            {event.kicker}
          </p>
        ) : null}
        <h2 className="text-balance font-serif text-[1.95rem] leading-[1.02] tracking-[-0.035em] text-white sm:text-[2.2rem]">
          {event.title}
        </h2>

        <div className="flex flex-wrap gap-1.5 pt-0.5">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[0.72rem] text-white/70">
            <Calendar className="h-3.5 w-3.5 text-white/58" />
            <span>{formatDateRange(event.eventDate, event.eventEndDate, "short")}</span>
            <span
              aria-hidden
              className="h-1 w-1 rounded-full bg-white/36"
            />
            <ImageIcon className="h-3.5 w-3.5 text-white/58" />
            <span>{photoCountLabel}</span>
          </span>
          {event.location ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[0.72rem] text-white/70">
              <MapPin className="h-3.5 w-3.5 text-white/58" />
              <span>{event.location}</span>
            </span>
          ) : null}
        </div>

        {/* Decorative CTA — the whole card is the anchor, so this is
            an inline row rather than a button, keeping a single
            clickable surface. */}
        <div className="mt-2 inline-flex items-center gap-3 text-sm text-white/88">
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/82 transition group-hover:border-[rgba(197,150,92,0.34)] group-hover:bg-[rgba(197,150,92,0.14)] group-hover:text-white">
            <ArrowRight className="h-4 w-4" />
          </span>
          <span className="transition group-hover:text-white">View Album</span>
        </div>
      </div>
    </Link>
  );
}
