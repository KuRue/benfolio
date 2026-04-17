/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";

import { notFound } from "next/navigation";

import { PhotoGrid } from "@/components/public/photo-grid";
import { PublicSiteMark } from "@/components/public/public-site-mark";
import { PublicPhotoSearchLauncher } from "@/components/public/public-photo-search-launcher";
import { getResolvedRuntimeSettings } from "@/lib/app-settings";
import { getPublicEventBySlug, getSiteProfile } from "@/lib/gallery";
import { absoluteUrl, formatDateRange } from "@/lib/strings";
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
      event.description ??
      `A curated event gallery from ${formatDateRange(event.eventDate, event.eventEndDate)}.`,
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
        `A curated event gallery from ${formatDateRange(event.eventDate, event.eventEndDate)}.`,
      url: absoluteUrl(`/e/${event.slug}`),
      images: image ? [{ url: absoluteUrl(image) }] : undefined,
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

  const coverUrl = buildDisplayUrl(event.coverDisplayKey);
  const coverPosition = `${event.coverFocalX ?? 50}% ${event.coverFocalY ?? 50}%`;

  return (
    <main className="pb-16 pt-2 sm:pt-3 lg:pt-4">
      <div className="mx-auto flex w-[min(100%-0.75rem,110rem)] flex-col gap-3 sm:w-[min(100%-1.25rem,110rem)] sm:gap-4">
        <section className="overflow-hidden rounded-[1.5rem] border border-white/8 bg-[#090909] shadow-[0_28px_96px_rgba(0,0,0,0.34)]">
          <div className="relative min-h-[10rem] overflow-hidden sm:min-h-[11.5rem] lg:min-h-[13rem]">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                style={{ objectPosition: coverPosition }}
              />
            ) : (
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(197,146,92,0.26),_transparent_32%),linear-gradient(145deg,_#141414,_#070707)]" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_34%,_rgba(0,0,0,0.18)_100%)]" />
            {runtimeSettings.logoMarkEnabled ? (
              <div className="absolute left-3 top-3 z-10 sm:left-4 sm:top-4">
                <PublicSiteMark
                  displayName={siteProfile.displayName}
                  logoDisplayKey={siteProfile.logoDisplayKey}
                />
              </div>
            ) : null}
            {runtimeSettings.publicSearchEnabled ? (
              <div className="absolute right-3 top-3 z-10 sm:right-4 sm:top-4">
                <PublicPhotoSearchLauncher
                  triggerClassName="floating-action inline-flex h-11 w-11 items-center justify-center text-white/68 transition hover:bg-white/10 hover:text-white"
                />
              </div>
            ) : null}
            <div className="relative flex min-h-[10rem] flex-col justify-end p-4 pt-16 sm:min-h-[11.5rem] sm:p-5 sm:pt-20 lg:min-h-[13rem] lg:p-6 lg:pt-20">
              <div className="max-w-4xl space-y-2">
                {event.kicker ? (
                  <p className="text-[0.72rem] uppercase tracking-[0.32em] text-white/60 sm:text-[0.78rem]">
                    {event.kicker}
                  </p>
                ) : null}
                <h1 className="text-balance font-serif text-[2.2rem] leading-[1.02] tracking-[-0.045em] text-white sm:text-[2.9rem] lg:text-[3.6rem]">
                  {event.title}
                </h1>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[0.68rem] uppercase tracking-[0.28em] text-white/56 sm:text-[0.72rem]">
                  <span>{formatDateRange(event.eventDate, event.eventEndDate)}</span>
                  {event.location ? <span>{event.location}</span> : null}
                  <span>{event.photos.length} photo{event.photos.length === 1 ? "" : "s"}</span>
                </div>
                {event.description ? (
                  <p className="max-w-2xl overflow-hidden text-pretty text-sm leading-6 text-white/68 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] sm:text-[0.95rem] sm:leading-7">
                    {event.description}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section>
          <PhotoGrid photos={event.photos} returnHref={`/e/${event.slug}`} />
        </section>
      </div>
    </main>
  );
}
