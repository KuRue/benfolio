import Link from "next/link";
import { Calendar, ImageIcon, MapPin } from "lucide-react";

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

// Cloudflare transformations: 3 widths cover mobile -> xl grid
// columns, cached after the first transformed request.
const GRID_WIDTHS = [480, 720, 960];
const GRID_SIZES = "(min-width: 1280px) 25rem, (min-width: 640px) 42vw, 100vw";

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
  const photoCountLabel = String(event._count.photos);

  return (
    <Link
      href={`/e/${event.slug}`}
      className="group relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/4 shadow-[0_20px_70px_rgba(0,0,0,0.28)] transition duration-300 hover:-translate-y-0.5 hover:border-white/16 hover:shadow-[0_30px_95px_rgba(0,0,0,0.36)]"
    >
      <div className="relative aspect-[9/11] overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(197,146,92,0.24),_transparent_32%),linear-gradient(145deg,_#111,_#050505)]">
        {coverUrl ? (
          <BlurUpImage
            src={coverUrl}
            srcSet={coverSrcSet}
            sizes={GRID_SIZES}
            alt=""
            blurDataUrl={event.coverBlurDataUrl}
            dominantColor={event.coverDominantColor}
            objectPosition={coverPosition}
            imgClassName="contrast-[1.08] saturate-[1.04] transition duration-700 group-hover:scale-[1.03] group-hover:contrast-[1.12] group-hover:saturate-[1.08]"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/92 via-black/20 to-black/8" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,_rgba(0,0,0,0.58)_0%,_rgba(0,0,0,0.32)_34%,_rgba(0,0,0,0.08)_68%,_transparent_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_34%,_rgba(0,0,0,0.22)_100%)] opacity-80 transition-opacity duration-300 group-hover:opacity-100" />
        <div className="absolute inset-x-0 bottom-0 p-4 pb-5 sm:p-5 sm:pb-6">
          <div className="space-y-3">
            <div className="space-y-1.5">
              {event.kicker ? (
                <p className="text-[0.74rem] font-semibold uppercase tracking-[0.26em] text-[#9c8cff] [text-shadow:_0_1px_16px_rgba(0,0,0,0.76),_0_0_18px_rgba(126,107,255,0.38)]">
                  {event.kicker}
                </p>
              ) : null}
              <h2 className="text-balance font-serif text-[2.35rem] leading-[0.96] tracking-[-0.05em] text-white [text-shadow:_0_3px_22px_rgba(0,0,0,0.62)] sm:text-[2.8rem]">
                {event.title}
              </h2>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="glass-chip px-3 py-2 text-sm text-white/82">
                <Calendar className="h-[15px] w-[15px]" />
                {formatDateRange(event.eventDate, event.eventEndDate, "short")}
              </span>
              <span className="glass-chip px-3 py-2 text-sm text-white/82">
                <ImageIcon className="h-[15px] w-[15px]" />
                {photoCountLabel}
              </span>
              {event.location ? (
                <span className="glass-chip px-3 py-2 text-sm text-white/82">
                  <MapPin className="h-[15px] w-[15px]" />
                  {event.location}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
