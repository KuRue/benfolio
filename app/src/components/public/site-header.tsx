/* eslint-disable @next/next/no-img-element */
import Link from "next/link";

import { PublicSiteMark } from "@/components/public/public-site-mark";
import { PublicPhotoSearchLauncher } from "@/components/public/public-photo-search-launcher";
import { getMonogram } from "@/lib/strings";
import { buildDisplayUrl } from "@/lib/storage";

type SiteHeaderProps = {
  profile: {
    displayName: string;
    handle: string | null;
    headline: string;
    bio: string;
    websiteUrl: string | null;
    instagramUrl: string | null;
    avatarDisplayKey: string | null;
    logoDisplayKey: string | null;
    coverDisplayKey: string | null;
    coverFocalX?: number | null;
    coverFocalY?: number | null;
  };
  showSearch?: boolean;
};

function getLinkLabel(linkHref: string | null, instagramUrl: string | null) {
  if (!linkHref) {
    return null;
  }

  if (instagramUrl && linkHref === instagramUrl) {
    return "Instagram";
  }

  try {
    return new URL(linkHref).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}

export function SiteHeader({ profile, showSearch = true }: SiteHeaderProps) {
  const avatarUrl = buildDisplayUrl(profile.avatarDisplayKey);
  const coverUrl = buildDisplayUrl(profile.coverDisplayKey);
  const publicBio = profile.headline.trim() || profile.bio.trim();
  const linkHref = profile.websiteUrl ?? profile.instagramUrl;
  const linkLabel = getLinkLabel(linkHref, profile.instagramUrl);
  const coverPosition = `${profile.coverFocalX ?? 50}% ${profile.coverFocalY ?? 50}%`;

  return (
    <section className="solid-panel relative overflow-hidden">
      <div className="absolute left-3 top-3 z-20 sm:left-4 sm:top-4">
        <PublicSiteMark
          displayName={profile.displayName}
          logoDisplayKey={profile.logoDisplayKey}
        />
      </div>
      {showSearch ? (
        <div className="absolute right-3 top-3 z-20 sm:right-4 sm:top-4">
          <PublicPhotoSearchLauncher
            triggerClassName="floating-action inline-flex h-11 w-11 items-center justify-center text-white/68 transition hover:bg-white/10 hover:text-white"
          />
        </div>
      ) : null}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(197,150,92,0.18),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(255,255,255,0.08),_transparent_24%)]" />
      <div className="relative h-24 w-full overflow-hidden sm:h-28 lg:h-32">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-[0.96]"
            style={{ objectPosition: coverPosition }}
          />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(197,146,92,0.26),_transparent_36%),linear-gradient(135deg,_#151515_0%,_#0b0b0b_48%,_#1a1a1a_100%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_28%,_rgba(0,0,0,0.32)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-[4.5rem] bg-gradient-to-t from-[#050505] via-[#050505]/82 to-transparent" />
      </div>

      <div className="relative z-10 border-t border-white/8 bg-[#050505]/96 px-3 pb-3 pt-1.5 sm:px-4 sm:pb-4 sm:pt-2 lg:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
          <div className="-mt-6 mx-auto h-[3.75rem] w-[3.75rem] shrink-0 overflow-hidden rounded-full border border-white/16 bg-white/8 shadow-[0_18px_42px_rgba(0,0,0,0.3)] sm:mx-0 sm:-mt-7 sm:h-[4.1rem] sm:w-[4.1rem] lg:h-[4.5rem] lg:w-[4.5rem]">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),_transparent_50%),linear-gradient(135deg,_rgba(196,151,95,0.35),_rgba(255,255,255,0.06))] font-serif text-[1.35rem] text-white/90 lg:text-[1.55rem]">
                {getMonogram(profile.displayName)}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-1 text-center sm:pb-1 sm:text-left">
            <div className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1 sm:justify-start">
              <h1 className="font-serif text-[1.4rem] leading-none tracking-[-0.045em] text-white sm:text-[1.75rem] lg:text-[2rem]">
                {profile.displayName}
              </h1>
              {profile.handle ? (
                <span className="text-[0.72rem] uppercase tracking-[0.18em] text-white/40 sm:text-[0.78rem]">
                  @{profile.handle}
                </span>
              ) : null}
            </div>
            {publicBio ? (
              <p className="max-w-2xl overflow-hidden text-pretty text-[0.88rem] leading-[1.42rem] text-white/58 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                {publicBio}
              </p>
            ) : null}
          </div>

          {linkHref && linkLabel ? (
            <div className="flex justify-center sm:justify-start sm:pb-1 lg:justify-end">
              <Link
                href={linkHref}
                target="_blank"
                rel="noreferrer"
                className="floating-action inline-flex h-9 items-center justify-center px-4 text-sm text-white/82 transition hover:bg-white/12 hover:text-white"
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
