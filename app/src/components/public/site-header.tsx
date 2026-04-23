/* eslint-disable @next/next/no-img-element */

import { BlurUpImage } from "@/components/public/blur-up-image";
import { PublicSiteMark } from "@/components/public/public-site-mark";
import { PublicPhotoSearchLauncher } from "@/components/public/public-photo-search-launcher";
import {
  buildTransformedImageUrl,
  buildTransformedSrcSet,
  gravityFromFocal,
} from "@/lib/cf-images";
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
    coverBlurDataUrl?: string | null;
    coverDominantColor?: string | null;
  };
  showSearch?: boolean;
  showLogoMark?: boolean;
  /** Resolved from `cfImagesEnabled` runtime setting by the caller. */
  cfEnabled?: boolean;
};

// 3 widths span mobile -> ultrawide. The header cover is the largest
// public image on the homepage, so it gets its own transformation pool.
const COVER_WIDTHS = [960, 1440, 1920];
const COVER_SIZES = "100vw";

export function SiteHeader({
  profile,
  showSearch = true,
  showLogoMark = true,
  cfEnabled = false,
}: SiteHeaderProps) {
  const avatarUrl = buildDisplayUrl(profile.avatarDisplayKey);
  const plainCoverUrl = buildDisplayUrl(profile.coverDisplayKey);
  const transformOptions = {
    fit: "cover" as const,
    quality: 82,
    gravity: gravityFromFocal(profile.coverFocalX, profile.coverFocalY),
  };
  const transformedCover = buildTransformedImageUrl(
    profile.coverDisplayKey,
    cfEnabled,
    {
      ...transformOptions,
      width: Math.max(...COVER_WIDTHS),
    },
  );
  const coverSrcSet = buildTransformedSrcSet(
    profile.coverDisplayKey,
    cfEnabled,
    COVER_WIDTHS,
    transformOptions,
  );
  const coverUrl = transformedCover ?? plainCoverUrl;
  const publicBio = profile.headline.trim() || profile.bio.trim();
  const coverPosition = `${profile.coverFocalX ?? 50}% ${profile.coverFocalY ?? 50}%`;

  return (
    <section className="relative left-1/2 isolate min-h-[29rem] w-screen -translate-x-1/2 overflow-hidden bg-[#050505] sm:min-h-[30rem] lg:min-h-[32rem]">
      {coverUrl ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[74%] opacity-[0.98]">
          <BlurUpImage
            src={coverUrl}
            srcSet={coverSrcSet}
            sizes={COVER_SIZES}
            alt=""
            blurDataUrl={profile.coverBlurDataUrl}
            dominantColor={profile.coverDominantColor}
            objectPosition={coverPosition}
          />
        </div>
      ) : (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[74%] bg-[radial-gradient(circle_at_top_left,_rgba(197,146,92,0.26),_transparent_36%),linear-gradient(135deg,_#151515_0%,_#0b0b0b_48%,_#1a1a1a_100%)]" />
      )}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(197,150,92,0.16),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(255,255,255,0.08),_transparent_24%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_30%,_rgba(0,0,0,0.3)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[74%] bg-gradient-to-b from-black/24 via-transparent via-[62%] to-[#050505]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[46%] bg-gradient-to-t from-[#050505] via-[#050505]/96 via-[42%] to-transparent" />

      {showLogoMark ? (
        <div className="absolute left-4 top-4 z-20 sm:left-5 sm:top-5">
          <PublicSiteMark
            displayName={profile.displayName}
            logoDisplayKey={profile.logoDisplayKey}
          />
        </div>
      ) : null}
      {showSearch ? (
        <div className="absolute right-4 top-4 z-20 sm:right-5 sm:top-5">
          <PublicPhotoSearchLauncher
            triggerClassName="floating-action inline-flex h-[3.25rem] w-[3.25rem] items-center justify-center rounded-full bg-black/38 text-white/78 transition hover:bg-white/12 hover:text-white sm:h-14 sm:w-14"
          />
        </div>
      ) : null}

      <div className="relative z-10 flex min-h-[29rem] flex-col items-center justify-end px-4 pb-6 pt-20 text-center sm:min-h-[30rem] sm:px-6 sm:pb-7 lg:min-h-[32rem] lg:pb-8">
        <div className="flex w-full max-w-3xl flex-col items-center">
          <div className="relative rounded-full bg-[conic-gradient(from_210deg,_#7d6bff,_#2bc4ff,_#7d6bff,_#b285ff,_#7d6bff)] p-[3px] shadow-[0_0_34px_rgba(125,107,255,0.42),0_24px_70px_rgba(0,0,0,0.55)]">
            <div className="h-[6.35rem] w-[6.35rem] overflow-hidden rounded-full bg-white/8 sm:h-[7rem] sm:w-[7rem]">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),_transparent_50%),linear-gradient(135deg,_rgba(120,99,255,0.42),_rgba(255,255,255,0.06))] font-serif text-[2rem] text-white/90">
                  {getMonogram(profile.displayName)}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 min-w-0 space-y-2">
            <h1 className="font-serif text-[3.5rem] leading-[0.84] tracking-[-0.06em] text-white [text-shadow:_0_4px_30px_rgba(0,0,0,0.62)] sm:text-[4.2rem] lg:text-[4.8rem]">
              {profile.displayName}
            </h1>
            {profile.handle ? (
              <p className="text-[0.78rem] uppercase tracking-[0.5em] text-white/62 [text-shadow:_0_1px_14px_rgba(0,0,0,0.55)] sm:text-[0.86rem]">
                @{profile.handle}
              </p>
            ) : null}
            {publicBio ? (
              <p className="mx-auto max-w-xl overflow-hidden text-pretty text-[1.02rem] leading-7 text-white/76 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [text-shadow:_0_1px_14px_rgba(0,0,0,0.55)] sm:text-[1.12rem]">
                {publicBio}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
