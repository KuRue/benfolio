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

  return (
    <section className="solid-panel relative overflow-hidden">
      {showSearch ? (
        <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
          <PublicPhotoSearchLauncher
            showLabel
            triggerClassName="floating-action inline-flex h-11 items-center justify-center gap-2 px-4 text-sm text-white/82 transition hover:bg-white/12 sm:h-12"
          />
        </div>
      ) : null}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(197,150,92,0.18),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(255,255,255,0.08),_transparent_24%)]" />
      <div className="relative h-60 w-full overflow-hidden sm:h-80 lg:h-[25rem]">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            className="h-full w-full object-cover opacity-[0.92]"
          />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(197,146,92,0.26),_transparent_36%),linear-gradient(135deg,_#151515_0%,_#0b0b0b_48%,_#1a1a1a_100%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/26 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_28%,_rgba(0,0,0,0.32)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#050505] via-[#050505]/82 to-transparent" />
      </div>

      <div className="relative z-10 -mt-12 px-4 pb-4 sm:-mt-[4.5rem] sm:px-6 sm:pb-6 lg:px-8 lg:pb-8">
        <div className="muted-panel grid gap-5 px-4 py-4 sm:px-6 sm:py-6 lg:grid-cols-[auto,1fr] lg:items-end lg:gap-7 lg:px-7 lg:py-7">
          <div className="mx-auto h-24 w-24 overflow-hidden rounded-full border border-white/18 bg-white/8 shadow-[0_26px_80px_rgba(0,0,0,0.42)] backdrop-blur-xl sm:mx-0 sm:h-[7.5rem] sm:w-[7.5rem] lg:h-36 lg:w-36">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),_transparent_50%),linear-gradient(135deg,_rgba(196,151,95,0.35),_rgba(255,255,255,0.06))] font-serif text-3xl text-white/90 lg:text-4xl">
                {getMonogram(profile.displayName)}
              </div>
            )}
          </div>

          <div className="space-y-4 pb-1 text-center sm:text-left">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <p className="editorial-kicker">Event Archive</p>
                {profile.handle ? (
                  <span className="glass-chip px-3 py-1.5 text-[0.68rem] uppercase tracking-[0.28em] text-[#e2bc8c]">
                    @{profile.handle}
                  </span>
                ) : null}
              </div>
              <div className="space-y-3">
                <h1 className="max-w-4xl font-serif text-[2.5rem] leading-none tracking-[-0.045em] text-white sm:text-5xl lg:text-[4.4rem]">
                  {profile.displayName}
                </h1>
                <p className="max-w-3xl text-balance text-[1.02rem] leading-7 text-white/78 sm:text-[1.15rem] sm:leading-8 lg:text-[1.28rem]">
                  {profile.headline}
                </p>
              </div>
              <p className="max-w-2xl text-pretty text-sm leading-7 text-white/58 sm:text-[0.98rem]">
                {profile.bio}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2.5 text-sm text-white/56 sm:justify-start">
              {profile.location ? (
                <span className="glass-chip px-3.5 py-2 text-sm text-white/68">
                  {profile.location}
                </span>
              ) : null}
              {profile.websiteUrl ? (
                <Link
                  href={profile.websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="glass-chip px-3.5 py-2 text-sm text-white/78 transition hover:text-white"
                >
                  Website
                </Link>
              ) : null}
              {profile.instagramUrl ? (
                <Link
                  href={profile.instagramUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="glass-chip px-3.5 py-2 text-sm text-white/78 transition hover:text-white"
                >
                  Instagram
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
