import { EventCard } from "@/components/public/event-card";
import { SiteHeader } from "@/components/public/site-header";
import { getHomepageData } from "@/lib/gallery";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { siteProfile, events } = await getHomepageData();

  return (
    <main className="pb-24 pt-4 sm:pt-6 lg:pt-8">
      <div className="section-shell space-y-8 sm:space-y-10 lg:space-y-12">
        <SiteHeader profile={siteProfile} />

        <section className="space-y-5 sm:space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2.5">
              <p className="editorial-label">Latest Events</p>
              <h2 className="max-w-3xl font-serif text-3xl tracking-[-0.04em] text-white sm:text-4xl lg:text-[2.9rem]">
                Reverse chronological, image first.
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-7 text-white/54 sm:text-[0.95rem]">
              Public releases appear here newest to oldest. Draft events stay private,
              and hidden events remain unlisted while preserving shareable links.
            </p>
          </div>

          {events.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 xl:gap-5">
              {events.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          ) : (
            <div className="solid-panel px-6 py-12 text-center text-sm leading-7 text-white/56">
              Public events will appear here after the first publish from the admin
              panel.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
