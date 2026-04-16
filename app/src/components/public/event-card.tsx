/* eslint-disable @next/next/no-img-element */
import Link from "next/link";

import { formatLongDate } from "@/lib/strings";
import { buildDisplayUrl } from "@/lib/storage";

type EventCardProps = {
  event: {
    title: string;
    slug: string;
    eventDate: Date;
    location: string | null;
    description: string | null;
    coverDisplayKey: string | null;
    _count: {
      photos: number;
    };
  };
};

export function EventCard({ event }: EventCardProps) {
  const coverUrl = buildDisplayUrl(event.coverDisplayKey);

  return (
    <Link
      href={`/e/${event.slug}`}
      className="group relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/4 shadow-[0_22px_70px_rgba(0,0,0,0.24)] transition duration-300 hover:-translate-y-1 hover:border-white/16 hover:shadow-[0_32px_95px_rgba(0,0,0,0.34)]"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(197,146,92,0.24),_transparent_32%),linear-gradient(145deg,_#111,_#050505)]">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.035] group-hover:saturate-[1.03]"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/12 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_35%,_rgba(0,0,0,0.24)_100%)] opacity-80 transition-opacity duration-300 group-hover:opacity-100" />
        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5 lg:p-6">
          <div className="glass-panel inline-flex items-center gap-3 rounded-full px-3.5 py-2 text-[0.68rem] uppercase tracking-[0.3em] text-white/62">
            <span>{formatLongDate(event.eventDate)}</span>
            <span className="h-1 w-1 rounded-full bg-white/40" />
            <span>{event._count.photos} photos</span>
          </div>
          <div className="mt-3 rounded-[1.45rem] border border-white/10 bg-black/28 px-4 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.2)] backdrop-blur-[8px] sm:px-5 sm:py-5">
            <div className="space-y-2.5">
              <h2 className="font-serif text-[1.9rem] leading-[0.96] tracking-[-0.03em] text-white sm:text-[2.15rem]">
                {event.title}
              </h2>
              {event.location ? (
                <p className="text-[0.72rem] uppercase tracking-[0.3em] text-white/52 sm:text-xs">
                  {event.location}
                </p>
              ) : null}
              {event.description ? (
                <p className="max-w-xl text-sm leading-6 text-white/64 sm:text-[0.95rem]">
                  {event.description}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
