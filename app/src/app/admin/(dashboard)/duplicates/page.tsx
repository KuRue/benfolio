import { DuplicateReviewPanel } from "@/components/admin/duplicate-review-panel";
import { getAdminDuplicateReviewData } from "@/lib/admin-duplicates";

export default async function AdminDuplicatesPage({
  searchParams,
}: {
  searchParams: Promise<{
    scope?: string;
    eventId?: string;
    visibility?: string;
    page?: string;
  }>;
}) {
  const { scope, eventId, visibility, page } = await searchParams;
  const data = await getAdminDuplicateReviewData({
    scope,
    eventId,
    visibility,
    page,
  });

  return (
    <DuplicateReviewPanel
      filters={data.filters}
      totalGroups={data.totalGroups}
      totalPages={data.totalPages}
      eventOptions={data.eventOptions.map((event) => ({
        ...event,
        eventDate: event.eventDate.toISOString(),
      }))}
      groups={data.duplicateGroups.map((group) => ({
        hash: group.hash,
        photoCount: group.photoCount,
        eventCount: group.eventCount,
        latestPhotoCreatedAt: group.latestPhotoCreatedAt.toISOString(),
        reviewDecision: group.reviewDecision,
        reviewedAt: group.reviewedAt?.toISOString() ?? null,
        reviewSnapshotCurrent: group.reviewSnapshotCurrent,
        photos: group.photos.map((photo) => ({
          id: photo.id,
          processingState: photo.processingState,
          originalFilename: photo.originalFilename,
          caption: photo.caption,
          altText: photo.altText,
          capturedAt: photo.capturedAt?.toISOString() ?? null,
          takenAtOverride: photo.takenAtOverride?.toISOString() ?? null,
          effectiveTakenAt: photo.effectiveTakenAt?.toISOString() ?? null,
          createdAt: photo.createdAt.toISOString(),
          sortOrder: photo.sortOrder,
          isCover: photo.isCover,
          event: photo.event,
          previewUrl: photo.previewUrl,
          importContext: photo.importContext,
        })),
      }))}
    />
  );
}
