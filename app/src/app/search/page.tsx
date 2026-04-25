/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";

import { PublicSearchInput } from "@/components/public/public-search-input";
import { PublicSiteMark } from "@/components/public/public-site-mark";
import { getResolvedRuntimeSettings } from "@/lib/app-settings";
import { getSiteProfile } from "@/lib/gallery";
import { searchPublicPhotos } from "@/lib/photo-search";

export const dynamic = "force-dynamic";

// Single-page result count. Comfortably more than the launcher modal's
// 12 (which is tuned for skim-on-typing) while staying under the
// MAX_RESULT_LIMIT cap in photo-search.ts. Pagination would be a
// follow-up if real searches start clipping at 60.
const PAGE_LIMIT = 60;

type SearchPageProps = {
  searchParams: Promise<{ query?: string | string[] }>;
};

function readQueryParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? "";
  }
  return value?.trim() ?? "";
}

export async function generateMetadata({
  searchParams,
}: SearchPageProps): Promise<Metadata> {
  const params = await searchParams;
  const query = readQueryParam(params.query);

  return {
    title: query ? `Search: ${query}` : "Search",
    description: query
      ? `Public photos matching "${query}".`
      : "Search the public photo archive by character, event, year, species, maker, or general tag.",
    // Don't index the bare /search landing page or arbitrary user
    // queries — those would create endless duplicate-y URLs.
    robots: {
      index: false,
      follow: true,
    },
  };
}

export default async function PublicSearchPage({
  searchParams,
}: SearchPageProps) {
  const params = await searchParams;
  const query = readQueryParam(params.query);

  const [siteProfile, runtimeSettings] = await Promise.all([
    getSiteProfile(),
    getResolvedRuntimeSettings(),
  ]);

  const results =
    query && runtimeSettings.publicSearchEnabled
      ? await searchPublicPhotos({ query, limit: PAGE_LIMIT })
      : [];

  return (
    <main className="pb-16 pt-2 sm:pt-3 lg:pt-4">
      <div className="section-shell space-y-4 sm:space-y-5 lg:space-y-6">
        <header className="flex items-center justify-between gap-3">
          {runtimeSettings.logoMarkEnabled ? (
            <PublicSiteMark
              displayName={siteProfile.displayName}
              logoDisplayKey={siteProfile.logoDisplayKey}
            />
          ) : (
            <Link
              href="/"
              className="font-serif text-[1.1rem] text-white/82 transition hover:text-white"
            >
              {siteProfile.displayName}
            </Link>
          )}
          <Link
            href="/"
            className="floating-action inline-flex items-center gap-2 px-4 py-2 text-sm text-white/72 transition hover:bg-white/10 hover:text-white"
          >
            ← Home
          </Link>
        </header>

        <section className="space-y-3 sm:space-y-4">
          <p className="editorial-label">Search</p>
          <h1 className="text-balance font-serif text-[2rem] leading-[1.04] tracking-[-0.045em] text-white sm:text-[2.4rem]">
            {query ? query : "Public archive"}
          </h1>
          <PublicSearchInput initialQuery={query} />
        </section>

        {!runtimeSettings.publicSearchEnabled ? (
          <div className="solid-panel px-6 py-12 text-center text-sm text-white/56">
            Public search is currently disabled.
          </div>
        ) : !query ? (
          <div className="solid-panel px-6 py-12 text-center text-sm text-white/56">
            Type a query above, or narrow by category with{" "}
            <span className="text-white/76">Maker:&quot;Name&quot;</span>.
          </div>
        ) : !results.length ? (
          <div className="solid-panel px-6 py-12 text-center text-sm text-white/56">
            No public photos match{" "}
            <span className="text-white/82">&ldquo;{query}&rdquo;</span>{" "}
            yet.
          </div>
        ) : (
          <>
            <p className="text-[0.7rem] uppercase tracking-[0.28em] text-white/45">
              {results.length} matching photo{results.length === 1 ? "" : "s"}
              {results.length === PAGE_LIMIT
                ? ` (showing the first ${PAGE_LIMIT})`
                : ""}
            </p>
            {/*
              CSS columns masonry. The reading order is column-by-column
              rather than row-by-row, but ordering is by relevance score
              first then date — and CSS columns put the highest-scored
              items at the top of each column, so the most relevant
              results stay visible above the fold.
            */}
            <div className="columns-2 gap-2 sm:gap-2.5 lg:columns-3 xl:columns-4 2xl:columns-5">
              {results.map((result) => (
                <Link
                  key={result.id}
                  href={result.href}
                  className="group mb-2 block break-inside-avoid sm:mb-2.5"
                >
                  <div
                    className="relative overflow-hidden rounded-[1rem] bg-[#0a0a0a]"
                    style={{
                      aspectRatio: `${result.previewWidth} / ${result.previewHeight}`,
                    }}
                  >
                    {result.previewUrl ? (
                      <img
                        src={result.previewUrl}
                        alt={result.altText ?? result.event.title}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))]" />
                    )}
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_40%,_rgba(0,0,0,0.18)_100%)]" />
                  </div>
                  <div className="px-1 pt-2">
                    <p className="line-clamp-1 font-serif text-[1rem] tracking-[-0.02em] text-white sm:text-[1.05rem]">
                      {result.event.title}
                    </p>
                    <p className="text-[0.65rem] uppercase tracking-[0.26em] text-white/42 sm:text-[0.68rem]">
                      {result.event.eventDateLabel}
                      {result.effectiveTakenAtLabel
                        ? ` · ${result.effectiveTakenAtLabel}`
                        : ""}
                    </p>
                    {result.matchedTagSummary ? (
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/56 sm:text-[0.78rem]">
                        {result.matchedTagSummary}
                      </p>
                    ) : null}
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
