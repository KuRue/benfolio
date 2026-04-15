import { EventCard } from "@/components/public/event-card";
import { SiteHeader } from "@/components/public/site-header";
import { getHomepageData } from "@/lib/gallery";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { siteProfile, events } = await getHomepageData();

  return (
    <main className="pb-20 pt-6 sm:pt-8">
      <div className="section-shell space-y-10">
        <SiteHeader profile={siteProfile} />

        <section className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-2">
              <p className="editorial-label">Latest Events</p>
              <h2 className="font-serif text-3xl tracking-[-0.03em] text-white sm:text-4xl">
                Reverse chronological, image first.
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-7 text-white/58">
              Public releases appear here newest to oldest. Draft events stay private,
              and hidden events remain unlisted while preserving shareable links.
            </p>
          </div>

          {events.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {events.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          ) : (
            <div className="admin-card px-6 py-10 text-center text-sm text-white/58">
              Public events will appear here after the first publish from the admin
              panel.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
