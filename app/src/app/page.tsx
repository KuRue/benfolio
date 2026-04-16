import { EventCard } from "@/components/public/event-card";
import { SiteHeader } from "@/components/public/site-header";
import { getHomepageData } from "@/lib/gallery";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { siteProfile, events } = await getHomepageData();

  return (
    <main className="pb-14 pt-1 sm:pt-2 lg:pt-3">
      <div className="section-shell space-y-3 sm:space-y-4">
        <SiteHeader profile={siteProfile} />

        <section>
          {events.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 xl:gap-5">
              {events.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          ) : (
            <div className="solid-panel px-6 py-10 text-center text-sm text-white/56">
              No public events yet.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
