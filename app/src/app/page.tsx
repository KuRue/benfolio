import { EventCard } from "@/components/public/event-card";
import { SiteHeader } from "@/components/public/site-header";
import { getHomepageData } from "@/lib/gallery";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { siteProfile, runtimeSettings, events } = await getHomepageData();

  return (
    <main className="pb-14 pt-0 sm:pt-2">
      <div className="section-shell space-y-4 sm:space-y-5">
        <SiteHeader
          profile={siteProfile}
          showSearch={runtimeSettings.publicSearchEnabled}
          showLogoMark={runtimeSettings.logoMarkEnabled}
          cfEnabled={runtimeSettings.cfImagesEnabled}
        />

        <section>
          {events.length ? (
            <div className="grid justify-center gap-4 xl:gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(19rem,100%),25rem))]">
              {events.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  cfEnabled={runtimeSettings.cfImagesEnabled}
                />
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
