/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";

import { notFound } from "next/navigation";

import { PhotoGrid } from "@/components/public/photo-grid";
import { PublicPhotoSearchLauncher } from "@/components/public/public-photo-search-launcher";
import { getPublicEventBySlug } from "@/lib/gallery";
import { absoluteUrl, formatLongDate } from "@/lib/strings";
import { buildDisplayUrl } from "@/lib/storage";

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

  return {
    title: event.title,
    description:
      event.description ?? `A curated event gallery from ${formatLongDate(event.eventDate)}.`,
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
      description:
        event.description ??
        `A curated event gallery from ${formatLongDate(event.eventDate)}.`,
      url: absoluteUrl(`/e/${event.slug}`),
      images: image ? [{ url: absoluteUrl(image) }] : undefined,
    },
  };
}

export default async function EventPage({ params }: EventPageProps) {
  const { slug } = await params;
  const event = await getPublicEventBySlug(slug);

  if (!event) {
    notFound();
  }

  const coverUrl = buildDisplayUrl(event.coverDisplayKey);

  return (
    <main className="pb-20 pt-6 sm:pt-8">
      <div className="section-shell space-y-8">
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-black/55 shadow-[0_30px_120px_rgba(0,0,0,0.32)]">
          <div className="relative min-h-[20rem] overflow-hidden">
            {coverUrl ? (
              <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(197,146,92,0.26),_transparent_32%),linear-gradient(145deg,_#141414,_#070707)]" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-transparent" />
            <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
              <PublicPhotoSearchLauncher triggerClassName="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/35 text-white/82 shadow-[0_18px_48px_rgba(0,0,0,0.35)] backdrop-blur-xl transition hover:bg-black/55" />
            </div>
            <div className="relative flex min-h-[20rem] flex-col justify-end p-6 sm:p-8 lg:p-10">
              <p className="editorial-label">Event</p>
              <div className="mt-4 max-w-4xl space-y-4">
                <h1 className="font-serif text-4xl leading-none tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">
                  {event.title}
                </h1>
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm uppercase tracking-[0.26em] text-white/54">
                  <span>{formatLongDate(event.eventDate)}</span>
                  {event.location ? <span>{event.location}</span> : null}
                  <span>{event.photos.length} photographs</span>
                </div>
                {event.description ? (
                  <p className="max-w-2xl text-base leading-8 text-white/68">
                    {event.description}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="editorial-label">Gallery</p>
              <h2 className="mt-2 font-serif text-2xl tracking-[-0.03em] text-white">
                Oldest to newest.
              </h2>
            </div>
          </div>
          <PhotoGrid photos={event.photos} />
        </section>
      </div>
    </main>
  );
}
