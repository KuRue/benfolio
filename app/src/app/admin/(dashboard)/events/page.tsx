import Link from "next/link";

import { getAdminEventList } from "@/lib/admin-data";

export default async function AdminEventsPage() {
  const events = await getAdminEventList();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="editorial-label">Events</p>
          <h1 className="font-serif text-4xl tracking-[-0.03em] text-white">
            Manage event pages
          </h1>
        </div>
        <Link
          href="/admin/events/new"
          className="rounded-full bg-white px-5 py-3 text-sm font-medium text-black"
        >
          Create event
        </Link>
      </div>

      <div className="grid gap-3">
        {events.map((event) => (
          <Link
            key={event.id}
            href={`/admin/events/${event.id}`}
            className="admin-card px-5 py-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-xl text-white">{event.title}</h2>
                <p className="text-sm text-white/54">
                  {event.slug} · {event.visibility}
                </p>
              </div>
              <div className="text-right text-sm text-white/54">
                <p>{event._count.photos} photos</p>
                <p>{event.eventDateLabel}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
