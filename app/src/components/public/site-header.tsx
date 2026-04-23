/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { ArrowRight } from "lucide-react";

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

// 3 widths span mobile → ultrawide. The header cover is edge-to-edge
// so it's consistently the largest cover on the page — keep AVIF/WebP
// on via the default `format=auto`.
const COVER_WIDTHS = [960, 1440, 1920];
const COVER_SIZES = "100vw";

function getLinkLabel(linkHref: string, instagramUrl: string | null) {
  if (instagramUrl && linkHref === instagramUrl) {
    return "Instagram";
  }

  try {
    return new URL(linkHref).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}

function buildProfileLinks(
  websiteUrl: string | null,
  instagramUrl: string | null,
) {
  const links: Array<{ href: string; label: string }> = [];
  const seen = new Set<string>();

  for (const href of [websiteUrl, instagramUrl]) {
    if (!href || seen.has(href)) {
      continue;
    }
    seen.add(href);
    links.push({ href, label: getLinkLabel(href, instagramUrl) });
  }

  return links;
}

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
  const profileLinks = buildProfileLinks(profile.websiteUrl, profile.instagramUrl);
  const coverPosition = `${profile.coverFocalX ?? 50}% ${profile.coverFocalY ?? 50}%`;

  return (
    <section className="solid-panel relative overflow-hidden">
      {/* Cover region — fills the top of the card. The avatar below
          overlaps this region's bottom edge, so the cover doesn't
          need to be tall enough to hold profile text. */}
      <div className="relative h-[14rem] overflow-hidden sm:h-[16rem] lg:h-[18rem]">
        {coverUrl ? (
          <div className="pointer-events-none absolute inset-0 opacity-[0.96]">
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
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(197,146,92,0.26),_transparent_36%),linear-gradient(135deg,_#151515_0%,_#0b0b0b_48%,_#1a1a1a_100%)]" />
        )}
        {/* Soft vignette + fade into the dark profile panel below. */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_30%,_rgba(0,0,0,0.34)_100%)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-[#050505] via-[#050505]/72 to-transparent" />

        {showLogoMark ? (
          <div className="absolute left-3 top-3 z-20 sm:left-4 sm:top-4">
            <PublicSiteMark
              displayName={profile.displayName}
              logoDisplayKey={profile.logoDisplayKey}
            />
          </div>
        ) : null}
        {showSearch ? (
          <div className="absolute right-3 top-3 z-20 sm:right-4 sm:top-4">
            <PublicPhotoSearchLauncher
              triggerClassName="floating-action inline-flex h-11 w-11 items-center justify-center text-white/68 transition hover:bg-white/10 hover:text-white"
            />
          </div>
        ) : null}
      </div>

      {/* Profile region — centered column, dark background. The
          avatar uses a negative top margin so it straddles the cover
          boundary, the classic "link-in-bio" profile silhouette. */}
      <div className="relative flex flex-col items-center px-5 pb-6 pt-3 sm:px-6 sm:pb-7 lg:pb-8">
        <div className="relative -mt-[3.25rem] mb-3 sm:-mt-[3.75rem] sm:mb-4">
          {/* Soft copper ring behind the avatar — mirrors the accent
              used on kickers and focus states, so the profile picks
              up the same editorial palette. */}
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-[3px] rounded-full bg-[conic-gradient(from_180deg_at_50%_50%,_rgba(197,150,92,0.78),_rgba(197,150,92,0.22),_rgba(197,150,92,0.78))] blur-[1.5px]"
          />
          <div className="relative h-[6.5rem] w-[6.5rem] overflow-hidden rounded-full border-2 border-white/20 bg-white/8 shadow-[0_22px_52px_rgba(0,0,0,0.5)] sm:h-[7rem] sm:w-[7rem]">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),_transparent_50%),linear-gradient(135deg,_rgba(196,151,95,0.35),_rgba(255,255,255,0.06))] font-serif text-[2rem] text-white/90">
                {getMonogram(profile.displayName)}
              </div>
            )}
          </div>
        </div>

        <h1 className="text-balance font-serif text-[2rem] leading-[1.04] tracking-[-0.045em] text-white sm:text-[2.4rem] lg:text-[2.7rem]">
          {profile.displayName}
        </h1>
        {profile.handle ? (
          <p className="mt-1.5 text-[0.72rem] uppercase tracking-[0.32em] text-white/52 sm:text-[0.78rem]">
            @{profile.handle}
          </p>
        ) : null}

        {publicBio ? (
          <p className="mt-3 max-w-xl text-pretty text-center text-[0.95rem] leading-6 text-white/70 sm:text-base">
            {publicBio}
          </p>
        ) : null}

        {profileLinks.length ? (
          <div className="mt-5 flex w-full flex-col items-center gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
            {profileLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="floating-action group inline-flex h-12 w-full max-w-[22rem] items-center justify-between gap-3 pl-5 pr-1.5 text-sm text-white/88 transition hover:bg-white/10 hover:text-white sm:w-auto sm:min-w-[14rem]"
              >
                <span className="truncate">{link.label}</span>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/8 text-white/82 transition group-hover:bg-[rgba(197,150,92,0.22)] group-hover:text-white">
                  <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
