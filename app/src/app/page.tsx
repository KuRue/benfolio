import { EventCard } from "@/components/public/event-card";
import { HighlightPhotoCard } from "@/components/public/highlight-photo-card";
import { HomepageSections } from "@/components/public/homepage-sections";
import { SiteHeader } from "@/components/public/site-header";
import { getHomepageData } from "@/lib/gallery";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { siteProfile, runtimeSettings, events, highlights } =
    await getHomepageData();
  const aboutBio =
    siteProfile.aboutBio?.trim() || siteProfile.bio?.trim() || "";

  return (
    <main className="pb-14 pt-0 sm:pt-2">
      <div className="section-shell space-y-4 sm:space-y-5">
        <SiteHeader
          profile={siteProfile}
          showSearch={runtimeSettings.publicSearchEnabled}
          showLogoMark={runtimeSettings.logoMarkEnabled}
          cfEnabled={runtimeSettings.cfImagesEnabled}
        />

        <HomepageSections
          albums={
            events.length ? (
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
            )
          }
          highlights={
            <div className="space-y-4">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-[0.7rem] uppercase tracking-[0.28em] text-[#a097ff]">
                    Highlights
                  </p>
                  <h2 className="mt-1 font-serif text-3xl tracking-[-0.045em] text-white sm:text-4xl">
                    Selected photos
                  </h2>
                </div>
              </div>

              {highlights.length ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {highlights.map((photo) => (
                    <HighlightPhotoCard
                      key={photo.id}
                      photo={photo}
                      cfEnabled={runtimeSettings.cfImagesEnabled}
                    />
                  ))}
                </div>
              ) : (
                <div className="solid-panel px-6 py-9 text-center text-sm text-white/56">
                  No highlights yet.
                </div>
              )}
            </div>
          }
          about={
            <div className="mx-auto max-w-4xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b0b0d]/72 px-6 py-7 shadow-[0_24px_86px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.06)] sm:px-8 sm:py-9">
              <p className="text-[0.7rem] uppercase tracking-[0.28em] text-[#a097ff]">
                About
              </p>
              <h2 className="mt-2 font-serif text-4xl tracking-[-0.055em] text-white sm:text-5xl">
                {siteProfile.displayName}
              </h2>
              <div className="mt-5 space-y-4 text-pretty text-base leading-7 text-white/68 sm:text-lg sm:leading-8">
                {aboutBio ? (
                  aboutBio.split(/\n{2,}/).map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))
                ) : (
                  <p>About details coming soon.</p>
                )}
              </div>
            </div>
          }
        />
      </div>
    </main>
  );
}
