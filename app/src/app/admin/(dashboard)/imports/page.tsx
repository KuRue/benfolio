import { ImportsPanel } from "@/components/admin/imports-panel";
import { getAdminImportsData } from "@/lib/admin-data";

export default async function AdminImportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    q?: string;
    visibility?: string;
  }>;
}) {
  const { status, q, visibility } = await searchParams;
  const data = await getAdminImportsData({
    status,
    query: q,
    visibility,
  });

  return (
    <ImportsPanel
      filters={data.filters}
      jobStatusSummary={data.jobStatusSummary}
      itemStatusSummary={data.itemStatusSummary}
      bulkActionSummary={data.bulkActionSummary}
      jobs={data.recentImportJobs.map((job) => ({
        id: job.id,
        status: job.status,
        trigger: job.trigger,
        adapterId: job.adapterId,
        errorMessage: job.errorMessage,
        processedItems: job.processedItems,
        totalItems: job.totalItems,
        createdAt: job.createdAt.toISOString(),
        startedAt: job.startedAt?.toISOString() ?? null,
        finishedAt: job.finishedAt?.toISOString() ?? null,
        eventSlug: job.eventSlug,
        sourcePrefix: job.sourcePrefix,
        sourcePathExample: job.sourcePathExample,
        cleanupMode: job.cleanupMode,
        fileCount: job.fileCount,
        itemCounts: job.itemCounts,
        event: job.event,
        requestedBy: job.requestedBy,
      }))}
      items={data.recentImportItems.map((item) => ({
        id: item.id,
        status: item.status,
        sourceKey: item.sourceKey,
        sourceFilename: item.sourceFilename,
        sourceByteSize: item.sourceByteSize?.toString() ?? null,
        sourceLastModified: item.sourceLastModified?.toISOString() ?? null,
        sourceProvider: item.sourceProvider,
        sourceEtag: item.sourceEtag,
        sourceVersion: item.sourceVersion,
        contentHashSha256: item.contentHashSha256,
        eventSlug: item.eventSlug,
        cleanupMode: item.cleanupMode,
        cleanupStatus: item.cleanupStatus,
        cleanupTargetKey: item.cleanupTargetKey,
        cleanupError: item.cleanupError,
        skipReason: item.skipReason,
        errorMessage: item.errorMessage,
        createdAt: item.createdAt.toISOString(),
        startedAt: item.startedAt?.toISOString() ?? null,
        completedAt: item.completedAt?.toISOString() ?? null,
        dismissedAt: item.dismissedAt?.toISOString() ?? null,
        trigger: item.trigger,
        event: item.event,
        photo: item.photo,
        importJob: {
          id: item.importJob.id,
          status: item.importJob.status,
          createdAt: item.importJob.createdAt.toISOString(),
        },
        timeline: item.timeline.map((event) => ({
          id: event.id,
          eventType: event.eventType,
          label: event.label,
          detail: event.detail,
          createdAt: event.createdAt.toISOString(),
        })),
        possibleDuplicates: item.possibleDuplicates,
      }))}
    />
  );
}
