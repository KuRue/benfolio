import { EventCard } from "@/components/public/event-card";
import { SiteHeader } from "@/components/public/site-header";
import { getHomepageData } from "@/lib/gallery";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { siteProfile, events } = await getHomepageData();

  return (
    <main className="pb-16 pt-2 sm:pt-3 lg:pt-4">
      <div className="section-shell space-y-4 sm:space-y-5">
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
