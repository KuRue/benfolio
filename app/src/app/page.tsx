import { EventCard } from "@/components/public/event-card";
import { SiteHeader } from "@/components/public/site-header";
import { getHomepageData } from "@/lib/gallery";
import { ImageIcon, Sparkles, UserRound } from "lucide-react";

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

        <nav
          className="mx-auto grid max-w-4xl grid-cols-3 rounded-full border border-white/10 bg-black/22 p-1.5 text-sm text-white/58 shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur-xl"
          aria-label="Homepage sections"
        >
          <a
            href="#albums"
            className="flex items-center justify-center gap-2 rounded-full bg-white/8 px-3 py-3 text-white shadow-[0_12px_32px_rgba(125,107,255,0.2)]"
            aria-current="page"
          >
            <ImageIcon className="h-4 w-4 text-[#9a8cff]" />
            <span>Albums</span>
          </a>
          <a
            href="#highlights"
            className="flex items-center justify-center gap-2 rounded-full px-3 py-3 transition hover:bg-white/6 hover:text-white"
          >
            <Sparkles className="h-4 w-4" />
            <span>Highlights</span>
          </a>
          <a
            href="#about"
            className="flex items-center justify-center gap-2 rounded-full px-3 py-3 transition hover:bg-white/6 hover:text-white"
          >
            <UserRound className="h-4 w-4" />
            <span>About</span>
          </a>
        </nav>

        <section id="albums">
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
