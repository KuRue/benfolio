import Link from "next/link";

import { getAdminDashboardData } from "@/lib/admin-data";

export default async function AdminOverviewPage() {
  const dashboard = await getAdminDashboardData();

  const cards = [
    { label: "Public events", value: dashboard.visibilitySummary.PUBLIC ?? 0 },
    { label: "Hidden events", value: dashboard.visibilitySummary.HIDDEN ?? 0 },
    { label: "Draft events", value: dashboard.visibilitySummary.DRAFT ?? 0 },
    { label: "Import jobs", value: dashboard.importJobCount },
    { label: "Photos", value: dashboard.photoCount },
  ];

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <p className="editorial-label">Overview</p>
          <h1 className="font-serif text-3xl tracking-[-0.04em] text-white sm:text-[2.45rem]">
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

      <section className="admin-card px-4 py-4 sm:px-5 sm:py-5">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {cards.map((card) => (
            <div
              key={card.label}
              className="rounded-[1.1rem] border border-white/8 bg-white/[0.03] px-3 py-3"
            >
              <p className="text-[0.72rem] uppercase tracking-[0.24em] text-white/42">
                {card.label}
              </p>
              <p className="mt-2 font-serif text-[1.9rem] leading-none tracking-[-0.04em] text-white">
                {card.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="admin-card space-y-4 px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1.5">
            <p className="editorial-label">Recent Events</p>
            <h2 className="font-serif text-[2rem] tracking-[-0.03em] text-white">
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

        <div className="grid gap-3">
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
