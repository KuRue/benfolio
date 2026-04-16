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
    <main className="pb-20 pt-3 sm:pt-4 lg:pt-5">
      <div className="mx-auto flex w-[min(100%-1rem,96rem)] flex-col gap-4 sm:w-[min(100%-1.5rem,96rem)] sm:gap-5">
        <section className="solid-panel overflow-hidden">
          <div className="relative min-h-[13rem] overflow-hidden sm:min-h-[15rem] lg:min-h-[17rem]">
            {coverUrl ? (
              <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(197,146,92,0.26),_transparent_32%),linear-gradient(145deg,_#141414,_#070707)]" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/26 to-transparent" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_30%,_rgba(0,0,0,0.22)_100%)]" />
            <div className="absolute right-3 top-3 z-10 sm:right-4 sm:top-4">
              <PublicPhotoSearchLauncher
                triggerClassName="floating-action inline-flex h-10 w-10 items-center justify-center text-white/74 transition hover:bg-white/10 hover:text-white"
              />
            </div>
            <div className="relative flex min-h-[13rem] flex-col justify-end p-4 sm:min-h-[15rem] sm:p-6 lg:min-h-[17rem] lg:p-8">
              <div className="max-w-4xl space-y-3">
                <h1 className="font-serif text-[2.5rem] leading-none tracking-[-0.045em] text-white sm:text-[3.4rem] lg:text-[4.3rem]">
                  {event.title}
                </h1>
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-[0.68rem] uppercase tracking-[0.28em] text-white/56 sm:text-[0.72rem]">
                  <span>{formatLongDate(event.eventDate)}</span>
                  {event.location ? <span>{event.location}</span> : null}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section>
          <PhotoGrid photos={event.photos} />
        </section>
      </div>
    </main>
  );
}
