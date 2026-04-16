/* eslint-disable @next/next/no-img-element */
import Link from "next/link";

import { PublicPhotoSearchLauncher } from "@/components/public/public-photo-search-launcher";
import { getMonogram } from "@/lib/strings";
import { buildDisplayUrl } from "@/lib/storage";

type SiteHeaderProps = {
  profile: {
    displayName: string;
    handle: string | null;
    headline: string;
    bio: string;
    location: string | null;
    websiteUrl: string | null;
    instagramUrl: string | null;
    avatarDisplayKey: string | null;
    coverDisplayKey: string | null;
  };
  showSearch?: boolean;
};

export function SiteHeader({ profile, showSearch = true }: SiteHeaderProps) {
  const avatarUrl = buildDisplayUrl(profile.avatarDisplayKey);
  const coverUrl = buildDisplayUrl(profile.coverDisplayKey);
  const publicBio = profile.headline.trim() || profile.bio.trim();
  const linkHref = profile.websiteUrl ?? profile.instagramUrl;
  const linkLabel = profile.websiteUrl ? "Visit link" : profile.instagramUrl ? "Instagram" : null;

  return (
    <section className="solid-panel relative overflow-hidden">
      {showSearch ? (
        <div className="absolute right-3 top-3 z-20 sm:right-4 sm:top-4">
          <PublicPhotoSearchLauncher
            triggerClassName="floating-action inline-flex h-10 w-10 items-center justify-center text-white/74 transition hover:bg-white/10 hover:text-white"
          />
        </div>
      ) : null}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(197,150,92,0.18),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(255,255,255,0.08),_transparent_24%)]" />
      <div className="relative h-32 w-full overflow-hidden sm:h-40 lg:h-52">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            className="h-full w-full object-cover opacity-[0.92]"
          />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(197,146,92,0.26),_transparent_36%),linear-gradient(135deg,_#151515_0%,_#0b0b0b_48%,_#1a1a1a_100%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_28%,_rgba(0,0,0,0.32)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#050505] via-[#050505]/82 to-transparent" />
      </div>

      <div className="relative z-10 -mt-8 px-3 pb-3 sm:-mt-10 sm:px-4 sm:pb-4 lg:px-5 lg:pb-5">
        <div className="muted-panel grid gap-4 px-4 py-4 sm:grid-cols-[auto,1fr] sm:items-end sm:px-5 sm:py-5 lg:grid-cols-[auto,1fr,auto] lg:gap-5 lg:px-6">
          <div className="mx-auto h-20 w-20 overflow-hidden rounded-full border border-white/18 bg-white/8 shadow-[0_24px_64px_rgba(0,0,0,0.34)] backdrop-blur-xl sm:mx-0 sm:h-24 sm:w-24 lg:h-28 lg:w-28">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),_transparent_50%),linear-gradient(135deg,_rgba(196,151,95,0.35),_rgba(255,255,255,0.06))] font-serif text-[1.8rem] text-white/90 lg:text-[2.15rem]">
                {getMonogram(profile.displayName)}
              </div>
            )}
          </div>

          <div className="min-w-0 space-y-2.5 text-center sm:text-left">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1 sm:justify-start">
                <h1 className="font-serif text-[2rem] leading-none tracking-[-0.045em] text-white sm:text-[2.6rem] lg:text-[3rem]">
                  {profile.displayName}
                </h1>
                {profile.handle ? (
                  <span className="text-sm text-white/46 sm:text-[0.95rem]">
                    @{profile.handle}
                  </span>
                ) : null}
              </div>
              {publicBio ? (
                <p className="max-w-2xl text-pretty text-sm leading-6 text-white/64 sm:text-[0.96rem] sm:leading-7">
                  {publicBio}
                </p>
              ) : null}
            </div>
          </div>

          {linkHref && linkLabel ? (
            <div className="flex justify-center sm:justify-start lg:justify-end">
              <Link
                href={linkHref}
                target="_blank"
                rel="noreferrer"
                className="floating-action inline-flex h-11 items-center justify-center px-4 text-sm text-white/82 transition hover:bg-white/12 hover:text-white"
              >
                {linkLabel}
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
