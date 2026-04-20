import Image from "next/image";
import Link from "next/link";

import {
  getAnalyticsSummary,
  getMostViewedPhotos,
  getTopReferrers,
  getUniqueVisitorsByDay,
} from "@/lib/admin-analytics";

export const dynamic = "force-dynamic";

const DAY_LABEL = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function formatDay(day: Date): string {
  return DAY_LABEL.format(day);
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

export default async function AdminAnalyticsPage() {
  const [summary, visitorsSeries, topPhotos, topReferrers] = await Promise.all([
    getAnalyticsSummary(),
    getUniqueVisitorsByDay(30),
    getMostViewedPhotos(25),
    getTopReferrers(15, 30),
  ]);

  const topReferrerCount = topReferrers[0]?.visitors ?? 0;

  const peakDailyVisitors = visitorsSeries.reduce(
    (peak, point) => Math.max(peak, point.visitors),
    0,
  );

  const cards = [
    { label: "Visitors today", value: summary.uniqueVisitorsToday },
    { label: "Visitors (7d)", value: summary.uniqueVisitorsLast7 },
    { label: "Visitors (30d)", value: summary.uniqueVisitorsLast30 },
    { label: "Photo views", value: summary.totalPhotoViews },
  ];

  const topViewCount = topPhotos[0]?.viewCount ?? 0;

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <p className="editorial-label">Analytics</p>
          <h1 className="font-serif text-[2rem] tracking-[-0.04em] text-white sm:text-[2.2rem]">
            Who&apos;s looking
          </h1>
          <p className="max-w-xl text-sm text-white/52">
            Unique visitors per day and the most-opened photos. A visitor
            opening the same photo three times in one day counts once. Bots
            and admins (you, when signed in) are excluded.
          </p>
        </div>
      </section>

      <section className="admin-card px-4 py-3 sm:px-5 sm:py-4">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <div
              key={card.label}
              className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-3 py-2.5"
            >
              <p className="text-[0.68rem] uppercase tracking-[0.22em] text-white/40">
                {card.label}
              </p>
              <p className="mt-1.5 font-serif text-[1.6rem] leading-none tracking-[-0.04em] text-white">
                {formatNumber(card.value)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="admin-card space-y-4 px-5 py-5 sm:px-6 sm:py-6">
        <div className="space-y-1.5">
          <p className="editorial-label">Last 30 days</p>
          <h2 className="font-serif text-[1.85rem] tracking-[-0.03em] text-white">
            Unique visitors per day
          </h2>
        </div>

        {peakDailyVisitors === 0 ? (
          <p className="text-sm text-white/52">
            No visitors tracked yet. Views begin accumulating the next time
            someone loads the public site.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-end gap-[3px] h-40 rounded-[1rem] border border-white/8 bg-white/[0.02] px-3 py-3">
              {visitorsSeries.map((point) => {
                const heightPct =
                  peakDailyVisitors === 0
                    ? 0
                    : (point.visitors / peakDailyVisitors) * 100;
                return (
                  <div
                    key={point.day.toISOString()}
                    className="group relative flex-1 min-w-[6px] flex items-end"
                    title={`${formatDay(point.day)}: ${formatNumber(point.visitors)} visitor${point.visitors === 1 ? "" : "s"}`}
                  >
                    <div
                      className="w-full rounded-t-[3px] bg-white/70 transition group-hover:bg-white"
                      style={{ height: `${Math.max(heightPct, point.visitors > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between text-[0.68rem] uppercase tracking-[0.22em] text-white/40">
              <span>{formatDay(visitorsSeries[0]!.day)}</span>
              <span>
                Peak {formatNumber(peakDailyVisitors)} · today{" "}
                {formatNumber(summary.uniqueVisitorsToday)}
              </span>
              <span>
                {formatDay(visitorsSeries[visitorsSeries.length - 1]!.day)}
              </span>
            </div>
          </div>
        )}
      </section>

      <section className="admin-card space-y-4 px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1.5">
            <p className="editorial-label">Traffic sources</p>
            <h2 className="font-serif text-[1.85rem] tracking-[-0.03em] text-white">
              Where they came from
            </h2>
            <p className="text-sm text-white/52">
              {summary.referredVisitorsLast30 > 0
                ? `${formatNumber(summary.referredVisitorsLast30)} referred visit${summary.referredVisitorsLast30 === 1 ? "" : "s"} from ${formatNumber(summary.uniqueReferrerHostsLast30)} source${summary.uniqueReferrerHostsLast30 === 1 ? "" : "s"} in the last 30 days.`
                : "No external referrals tracked yet. Direct loads and same-origin navigation are excluded."}
            </p>
          </div>
          <p className="text-xs uppercase tracking-[0.22em] text-white/40">
            30 days · unique visitors
          </p>
        </div>

        {topReferrers.length === 0 ? (
          <p className="text-sm text-white/52">
            Referrals will show up here once someone clicks a link to the
            site from Discord, a tweet, another blog, etc.
          </p>
        ) : (
          <ol className="grid gap-2">
            {topReferrers.map((ref, index) => {
              const barPct =
                topReferrerCount === 0
                  ? 0
                  : (ref.visitors / topReferrerCount) * 100;
              return (
                <li
                  key={ref.referrerHost}
                  className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-3 py-2.5"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 shrink-0 text-right font-serif text-base text-white/48">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate text-sm text-white">
                          {ref.referrerHost}
                        </p>
                        <p className="shrink-0 font-serif text-lg leading-none tracking-[-0.02em] text-white">
                          {formatNumber(ref.visitors)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/8">
                          <div
                            className="h-full rounded-full bg-white/70"
                            style={{ width: `${barPct}%` }}
                          />
                        </div>
                        <p className="shrink-0 text-[0.68rem] uppercase tracking-[0.22em] text-white/40">
                          {ref.topLandingPath
                            ? `→ ${ref.topLandingPath}${ref.topLandingPathCount > 1 ? ` (${formatNumber(ref.topLandingPathCount)})` : ""}`
                            : ""}
                          {ref.visitorsLast7 > 0
                            ? `${ref.topLandingPath ? " · " : ""}+${formatNumber(ref.visitorsLast7)} (7d)`
                            : ""}
                        </p>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="admin-card space-y-4 px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1.5">
            <p className="editorial-label">Leaderboard</p>
            <h2 className="font-serif text-[1.85rem] tracking-[-0.03em] text-white">
              Most viewed photos
            </h2>
          </div>
          <p className="text-xs uppercase tracking-[0.22em] text-white/40">
            All-time · unique viewers
          </p>
        </div>

        {topPhotos.length === 0 ? (
          <p className="text-sm text-white/52">
            No photo views tracked yet.
          </p>
        ) : (
          <ol className="grid gap-2.5">
            {topPhotos.map((photo, index) => {
              const barPct =
                topViewCount === 0
                  ? 0
                  : (photo.viewCount / topViewCount) * 100;
              const label =
                photo.title ??
                photo.caption ??
                photo.altText ??
                `Photo ${photo.id}`;

              return (
                <li
                  key={photo.id}
                  className="rounded-[1.2rem] border border-white/8 bg-white/4 transition hover:border-white/14 hover:bg-white/[0.06]"
                >
                  <Link
                    href={`/p/${photo.id}`}
                    className="flex items-center gap-3 px-3 py-3"
                  >
                    <span className="w-7 shrink-0 text-right font-serif text-lg tracking-[-0.02em] text-white/48">
                      {index + 1}
                    </span>
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[0.6rem] border border-white/8 bg-black/60">
                      {photo.previewUrl ? (
                        <Image
                          src={photo.previewUrl}
                          alt={photo.altText ?? label}
                          fill
                          sizes="56px"
                          className="object-cover"
                        />
                      ) : null}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate text-sm text-white">{label}</p>
                        <p className="shrink-0 font-serif text-lg leading-none tracking-[-0.02em] text-white">
                          {formatNumber(photo.viewCount)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/8">
                          <div
                            className="h-full rounded-full bg-white/70"
                            style={{ width: `${barPct}%` }}
                          />
                        </div>
                        <p className="shrink-0 text-[0.68rem] uppercase tracking-[0.22em] text-white/40">
                          {photo.event.title}
                          {photo.viewCountLast7 > 0
                            ? ` · +${formatNumber(photo.viewCountLast7)} (7d)`
                            : ""}
                        </p>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
