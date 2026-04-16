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
    <div className="space-y-8 sm:space-y-9">
      <section className="space-y-2.5">
        <p className="editorial-label">Overview</p>
        <h1 className="font-serif text-4xl tracking-[-0.04em] text-white sm:text-[2.8rem]">
          Keep the library moving.
        </h1>
        <p className="max-w-2xl text-sm text-white/54 sm:text-[0.95rem]">
          Events, uploads, imports, and cleanup at a glance.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <div key={card.label} className="admin-card px-5 py-6">
            <p className="text-sm text-white/54">{card.label}</p>
            <p className="mt-3 font-serif text-4xl tracking-[-0.04em] text-white">
              {card.value}
            </p>
          </div>
        ))}
      </section>

      <section className="admin-card space-y-5 px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="editorial-label">Recent Events</p>
            <h2 className="mt-2 font-serif text-3xl tracking-[-0.03em] text-white">
              Recent work
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/events/new" className="admin-button">
              New event
            </Link>
            <Link href="/admin/duplicates" className="admin-button-muted">
              Review duplicates
            </Link>
            <Link href="/admin/imports" className="admin-button-muted">
              Import jobs
            </Link>
            <Link href="/admin/uploads" className="admin-button-muted">
              Upload photos
            </Link>
          </div>
        </div>

        <div className="grid gap-3">
          {dashboard.recentEvents.map((event) => (
            <Link
              key={event.id}
              href={`/admin/events/${event.id}`}
              className="rounded-[1.25rem] border border-white/8 bg-white/4 px-4 py-4 transition hover:border-white/14 hover:bg-white/[0.06]"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg text-white">{event.title}</h3>
                  <p className="text-sm text-white/54">
                    {event.slug} · {event.visibility}
                  </p>
                </div>
                <p className="text-sm text-white/54">{event._count.photos} photos</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
