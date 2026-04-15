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
    <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-black/60 shadow-[0_40px_120px_rgba(0,0,0,0.35)]">
      {showSearch ? (
        <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
          <PublicPhotoSearchLauncher triggerClassName="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/35 text-white/82 shadow-[0_18px_48px_rgba(0,0,0,0.35)] backdrop-blur-xl transition hover:bg-black/55" />
        </div>
      ) : null}
      <div className="relative h-56 w-full overflow-hidden sm:h-72 lg:h-[22rem]">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            className="h-full w-full object-cover opacity-90"
          />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(197,146,92,0.26),_transparent_36%),linear-gradient(135deg,_#151515_0%,_#0b0b0b_48%,_#1a1a1a_100%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black to-transparent" />
      </div>

      <div className="relative -mt-14 grid gap-6 px-5 pb-6 sm:px-8 lg:grid-cols-[auto,1fr] lg:items-end">
        <div className="h-28 w-28 overflow-hidden rounded-full border border-white/20 bg-white/8 shadow-[0_24px_80px_rgba(0,0,0,0.4)] backdrop-blur-xl sm:h-32 sm:w-32">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),_transparent_50%),linear-gradient(135deg,_rgba(196,151,95,0.35),_rgba(255,255,255,0.06))] font-serif text-3xl text-white/90">
              {getMonogram(profile.displayName)}
            </div>
          )}
        </div>

        <div className="space-y-4 pb-1">
          <div className="space-y-3">
            <p className="text-[0.68rem] uppercase tracking-[0.4em] text-white/50">
              Event Archive
            </p>
            <div className="space-y-2">
              <h1 className="max-w-4xl font-serif text-4xl leading-none tracking-[-0.03em] text-white sm:text-5xl lg:text-6xl">
                {profile.displayName}
              </h1>
              {profile.handle ? (
                <p className="text-sm uppercase tracking-[0.28em] text-[#d7b287] sm:text-[0.95rem]">
                  @{profile.handle}
                </p>
              ) : null}
              <p className="max-w-3xl text-balance text-lg text-white/78 sm:text-xl">
                {profile.headline}
              </p>
            </div>
            <p className="max-w-2xl text-pretty text-sm leading-7 text-white/62 sm:text-base">
              {profile.bio}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm text-white/56">
            {profile.location ? <span>{profile.location}</span> : null}
            {profile.websiteUrl ? (
              <Link
                href={profile.websiteUrl}
                target="_blank"
                rel="noreferrer"
                className="glass-chip"
              >
                Website
              </Link>
            ) : null}
            {profile.instagramUrl ? (
              <Link
                href={profile.instagramUrl}
                target="_blank"
                rel="noreferrer"
                className="glass-chip"
              >
                Instagram
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
