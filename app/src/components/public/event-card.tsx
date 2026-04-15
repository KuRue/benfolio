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
      className="group relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/4 transition-transform duration-300 hover:-translate-y-1"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(197,146,92,0.24),_transparent_32%),linear-gradient(145deg,_#111,_#050505)]">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/18 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
          <div className="glass-panel inline-flex items-center gap-3 px-3 py-1.5 text-[0.68rem] uppercase tracking-[0.3em] text-white/60">
            <span>{formatLongDate(event.eventDate)}</span>
            <span className="h-1 w-1 rounded-full bg-white/40" />
            <span>{event._count.photos} photos</span>
          </div>
          <div className="mt-4 space-y-2">
            <h2 className="font-serif text-2xl leading-tight tracking-[-0.02em] text-white sm:text-[2rem]">
              {event.title}
            </h2>
            {event.location ? (
              <p className="text-sm uppercase tracking-[0.25em] text-white/52">
                {event.location}
              </p>
            ) : null}
            {event.description ? (
              <p className="max-w-xl text-sm leading-6 text-white/64">
                {event.description}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  );
}
