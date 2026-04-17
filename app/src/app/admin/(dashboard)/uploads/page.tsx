import { UploadDropzone } from "@/components/admin/upload-dropzone";
import { getResolvedRuntimeSettings } from "@/lib/app-settings";
import { getAdminEventOptions } from "@/lib/admin-data";

export default async function AdminUploadsPage() {
  const [events, runtimeSettings] = await Promise.all([
    getAdminEventOptions(),
    getResolvedRuntimeSettings(),
  ]);

  return (
    <UploadDropzone
      directUploadEnabled={runtimeSettings.directUploadEnabled}
      defaultVisibility={runtimeSettings.defaultEventVisibility}
      events={events.map((event) => ({
        id: event.id,
        title: event.title,
        slug: event.slug,
        eventDateLabel: event.eventDateLabel,
        visibility: event.visibility,
      }))}
    />
  );
}
