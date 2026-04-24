import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { EventCard } from "@/components/public/event-card";
import { HighlightPhotoCard } from "@/components/public/highlight-photo-card";
import { HomepageSections } from "@/components/public/homepage-sections";
import { SiteHeader } from "@/components/public/site-header";
import { getHomepageData } from "@/lib/gallery";

export const dynamic = "force-dynamic";

function getProfileLinkLabel(linkHref: string, instagramUrl: string | null) {
  if (instagramUrl && linkHref === instagramUrl) {
    return "Instagram";
  }

  try {
    return new URL(linkHref).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}

export default async function Home() {
  const { siteProfile, runtimeSettings, events, highlights } =
    await getHomepageData();
  const aboutBio =
    siteProfile.aboutBio?.trim() || siteProfile.bio?.trim() || "";
  const profileLinkHref = siteProfile.websiteUrl ?? siteProfile.instagramUrl;
  const profileLink = profileLinkHref
    ? {
        href: profileLinkHref,
        label: getProfileLinkLabel(profileLinkHref, siteProfile.instagramUrl),
      }
    : null;

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
            <>
              {highlights.length ? (
                <div className="grid grid-cols-2 gap-3 [grid-auto-rows:5rem] sm:[grid-auto-rows:5.75rem] lg:grid-cols-4 lg:[grid-auto-rows:6.25rem] xl:grid-cols-6">
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
            </>
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
              {profileLink ? (
                <Link
                  href={profileLink.href}
                  target="_blank"
                  rel="noreferrer"
                  className="floating-action relative mt-7 inline-flex min-w-[13rem] items-center justify-center gap-4 overflow-hidden rounded-full border-white/14 bg-white/[0.045] px-7 py-3.5 text-sm text-white/88 shadow-[0_22px_72px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.09)] transition before:pointer-events-none before:absolute before:inset-x-4 before:top-0 before:h-8 before:bg-[radial-gradient(ellipse_at_top,_rgba(147,129,255,0.5),_rgba(43,196,255,0.18)_34%,_transparent_72%)] before:blur-md before:content-[''] hover:bg-white/12 hover:text-white sm:min-w-[15rem] sm:text-base"
                >
                  <span className="relative z-10">{profileLink.label}</span>
                  <ArrowRight aria-hidden className="relative z-10 h-5 w-5" />
                </Link>
              ) : null}
            </div>
          }
        />
      </div>
    </main>
  );
}
