import Link from "next/link";

import { SystemStatusPanel } from "@/components/admin/system-status-panel";
import {
  getAnalyticsSummary,
  getMostViewedPhotos,
} from "@/lib/admin-analytics";
import { getAdminDashboardData } from "@/lib/admin-data";
import { getSystemDiagnostics } from "@/lib/system-status";

export default async function AdminOverviewPage() {
  const [dashboard, diagnostics, analyticsSummary, topPhotos] = await Promise.all([
    getAdminDashboardData(),
    getSystemDiagnostics(),
    getAnalyticsSummary(),
    getMostViewedPhotos(5),
  ]);

  const cards = [
    { label: "Photos", value: dashboard.photoCount },
    { label: "Public", value: dashboard.visibilitySummary.PUBLIC ?? 0 },
    { label: "Drafts", value: dashboard.visibilitySummary.DRAFT ?? 0 },
    { label: "Imports", value: dashboard.importJobCount },
  ];

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <p className="editorial-label">Overview</p>
          <h1 className="font-serif text-[2rem] tracking-[-0.04em] text-white sm:text-[2.2rem]">
            Library
          </h1>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/admin/events/new" className="admin-button">
            New event
          </Link>
          <Link href="/admin/uploads" className="admin-button-muted">
            Upload
          </Link>
          <Link href="/admin/imports" className="admin-button-muted">
            Imports
          </Link>
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
                {card.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      <SystemStatusPanel
        compact
        initialDiagnostics={{
          checks: diagnostics.checks,
          queueCounts: diagnostics.queueCounts,
          failures: diagnostics.failures,
          lastSuccess: {
            photoProcessedAt: diagnostics.lastSuccess.photoProcessedAt?.toISOString() ?? null,
            importCompletedAt:
              diagnostics.lastSuccess.importCompletedAt?.toISOString() ?? null,
          },
          setup: diagnostics.setup,
          warnings: diagnostics.warnings,
        }}
      />

      <section className="admin-card space-y-4 px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1.5">
            <p className="editorial-label">Audience</p>
            <h2 className="font-serif text-[1.85rem] tracking-[-0.03em] text-white">
              Most viewed
            </h2>
            <p className="text-sm text-white/52">
              {analyticsSummary.uniqueVisitorsToday.toLocaleString("en-US")}{" "}
              visitor
              {analyticsSummary.uniqueVisitorsToday === 1 ? "" : "s"} today ·{" "}
              {analyticsSummary.uniqueVisitorsLast7.toLocaleString("en-US")} in
              the last 7 days
            </p>
          </div>
          <Link href="/admin/analytics" className="admin-button-muted">
            Open analytics
          </Link>
        </div>

        {topPhotos.length === 0 ? (
          <p className="text-sm text-white/52">
            No photo views tracked yet.
          </p>
        ) : (
          <ol className="grid gap-2">
            {topPhotos.map((photo, index) => {
              const label =
                photo.title ??
                photo.caption ??
                photo.altText ??
                `Photo ${photo.id}`;
              return (
                <li
                  key={photo.id}
                  className="rounded-[1rem] border border-white/8 bg-white/[0.03]"
                >
                  <Link
                    href={`/p/${photo.id}`}
                    className="flex items-center gap-3 px-3 py-2"
                  >
                    <span className="w-6 shrink-0 text-right font-serif text-base text-white/48">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-white">{label}</p>
                      <p className="truncate text-[0.68rem] uppercase tracking-[0.22em] text-white/40">
                        {photo.event.title}
                      </p>
                    </div>
                    <p className="shrink-0 font-serif text-base leading-none tracking-[-0.02em] text-white">
                      {photo.viewCount.toLocaleString("en-US")}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="admin-card space-y-4 px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1.5">
            <p className="editorial-label">Recent Events</p>
            <h2 className="font-serif text-[1.85rem] tracking-[-0.03em] text-white">
              Events
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/tags" className="admin-button-muted">
              Tags
            </Link>
            <Link href="/admin/duplicates" className="admin-button-muted">
              Duplicates
            </Link>
          </div>
        </div>

        <div className="grid gap-2.5">
          {dashboard.recentEvents.map((event) => (
            <Link
              key={event.id}
              href={`/admin/events/${event.id}`}
              className="rounded-[1.2rem] border border-white/8 bg-white/4 px-4 py-3 transition hover:border-white/14 hover:bg-white/[0.06]"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-base text-white">{event.title}</h3>
                  <p className="text-xs uppercase tracking-[0.22em] text-white/40">
                    {event.slug} · {event.visibility}
                  </p>
                </div>
                <p className="text-sm text-white/52">{event._count.photos} photos</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
