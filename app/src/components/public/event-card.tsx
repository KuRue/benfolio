import Link from "next/link";

import { BlurUpImage } from "@/components/public/blur-up-image";
import { gravityFromFocal } from "@/lib/cf-images";
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
};

export function EventCard({ event }: EventCardProps) {
  const coverUrl = buildDisplayUrl(event.coverDisplayKey);
  const coverPosition = `${event.coverFocalX ?? 50}% ${event.coverFocalY ?? 50}%`;

  return (
    <Link
      href={`/e/${event.slug}`}
      className="group relative overflow-hidden rounded-[1.6rem] border border-white/10 bg-white/4 shadow-[0_18px_56px_rgba(0,0,0,0.22)] transition duration-300 hover:-translate-y-0.5 hover:border-white/16 hover:shadow-[0_26px_80px_rgba(0,0,0,0.3)]"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(197,146,92,0.24),_transparent_32%),linear-gradient(145deg,_#111,_#050505)]">
        {coverUrl ? (
          <BlurUpImage
            src={coverUrl}
            alt=""
            blurDataUrl={event.coverBlurDataUrl}
            dominantColor={event.coverDominantColor}
            objectPosition={coverPosition}
            imgClassName="transition duration-700 group-hover:scale-[1.03] group-hover:saturate-[1.03]"
            // Cloudflare transformations: 3 widths cover mobile → xl grid
            // columns (~22rem max). ~3 transforms per unique event cover
            // per month, cached after that.
            cfStorageKey={event.coverDisplayKey}
            cfWidths={[480, 720, 960]}
            cfSizes="(min-width: 1280px) 22rem, (min-width: 640px) 40vw, 100vw"
            cfOptions={{
              fit: "cover",
              quality: 82,
              gravity: gravityFromFocal(event.coverFocalX, event.coverFocalY),
            }}
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/88 via-black/14 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_35%,_rgba(0,0,0,0.18)_100%)] opacity-80 transition-opacity duration-300 group-hover:opacity-100" />
        <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4 lg:p-5">
          <div className="glass-panel inline-flex items-center gap-3 rounded-full px-3.5 py-2 text-[0.66rem] uppercase tracking-[0.28em] text-white/66">
            <span>{formatDateRange(event.eventDate, event.eventEndDate, "short")}</span>
            <span className="h-1 w-1 rounded-full bg-white/36" />
            <span>{event._count.photos} photos</span>
          </div>
          <div className="mt-3 rounded-[1.3rem] border border-white/10 bg-black/24 px-4 py-4 shadow-[0_16px_40px_rgba(0,0,0,0.2)] backdrop-blur-[7px] sm:px-5 sm:py-4.5">
            <div className="space-y-1.5">
              {event.kicker ? (
                <p className="text-[0.66rem] uppercase tracking-[0.28em] text-white/60 sm:text-[0.7rem]">
                  {event.kicker}
                </p>
              ) : null}
              <h2 className="text-balance font-serif text-[1.85rem] leading-[1.02] tracking-[-0.03em] text-white sm:text-[2.05rem]">
                {event.title}
              </h2>
              <p className="text-[0.72rem] uppercase tracking-[0.28em] text-white/52 sm:text-xs">
                {event.location ?? event.slug}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
