import Link from "next/link";
import { notFound } from "next/navigation";

import { deleteEventAction, updateEventAction } from "@/app/admin/actions";
import { EventDangerZone } from "@/components/admin/event-danger-zone";
import { EventForm } from "@/components/admin/event-form";
import { EventPhotoManager } from "@/components/admin/event-photo-manager";
import { getAdminEventEditorData, getAdminEventOptions } from "@/lib/admin-data";

type EditEventPageProps = {
  params: Promise<{
    eventId: string;
  }>;
  searchParams: Promise<{
    status?: string;
    q?: string;
    page?: string;
  }>;
};

export default async function EditEventPage({
  params,
  searchParams,
}: EditEventPageProps) {
  const { eventId } = await params;
  const { status, q, page } = await searchParams;
  const [event, eventOptions] = await Promise.all([
    getAdminEventEditorData(eventId, {
      status,
      query: q,
      page,
    }),
    getAdminEventOptions(),
  ]);

  if (!event) {
    notFound();
  }

  const deleteAction = deleteEventAction.bind(null, eventId);
  const formAction = updateEventAction.bind(null, eventId);

  return (
    <div className="space-y-8">
      <EventForm
        title={`Edit ${event.title}`}
        description="Metadata and cover."
        submitLabel="Save changes"
        action={formAction}
        initialValues={{
          title: event.title,
          slug: event.slug,
          eventDate: event.eventDate.toISOString().slice(0, 10),
          location: event.location ?? "",
          description: event.description ?? "",
          visibility: event.visibility,
        }}
      />

      <EventPhotoManager
        eventId={event.id}
        eventSlug={event.slug}
        photoOrderMode={event.photoOrderMode}
        filters={{
          status: event.filters.status,
          query: event.filters.query,
          page: event.filters.page,
        }}
        pagination={event.pagination}
        summary={{
          total: event.photoSummary.total,
          filteredCount: event.photoSummary.filteredCount,
          READY: event.photoSummary.READY,
          PROCESSING: event.photoSummary.PROCESSING,
          UPLOADED: event.photoSummary.UPLOADED,
          FAILED: event.photoSummary.FAILED,
        }}
        duplicateCandidateCount={event.duplicateCandidateCount}
        eventOptions={eventOptions
          .filter((candidate) => candidate.id !== event.id)
          .map((candidate) => ({
            id: candidate.id,
            title: candidate.title,
            slug: candidate.slug,
            visibility: candidate.visibility,
            eventDate: candidate.eventDate?.toISOString() ?? null,
          }))}
        photos={event.photos.map((photo) => ({
          id: photo.id,
          sortOrder: photo.sortOrder,
          processingState: photo.processingState,
          errorMessage: photo.errorMessage,
          originalFilename: photo.originalFilename,
          caption: photo.caption,
          altText: photo.altText,
          capturedAt: photo.capturedAt?.toISOString() ?? null,
          takenAtOverride: photo.takenAtOverride?.toISOString() ?? null,
          effectiveTakenAt: photo.effectiveTakenAt?.toISOString() ?? null,
          createdAt: photo.createdAt.toISOString(),
          previewUrl: photo.previewUrl,
          previewWidth: photo.previewWidth,
          previewHeight: photo.previewHeight,
          tags: photo.tags.map((tag) => ({
            id: tag.id,
            name: tag.name,
            slug: tag.slug,
            category: tag.category,
          })),
          isCover: photo.isCover,
        }))}
      />

      <section className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
        <aside className="admin-card space-y-5 px-6 py-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="editorial-label">Uploads</p>
              <h2 className="mt-2 font-serif text-3xl tracking-[-0.03em] text-white">
                Add more photos
              </h2>
            </div>
            <Link
              href="/admin/uploads"
              className="rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-white/72"
            >
              Open uploader
            </Link>
          </div>
          <p className="text-sm text-white/58">
            New uploads will appear above after processing.
          </p>
        </aside>

        <EventDangerZone action={deleteAction} />
      </section>
    </div>
  );
}
