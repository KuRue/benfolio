import { UploadDropzone } from "@/components/admin/upload-dropzone";
import { getAdminEventOptions } from "@/lib/admin-data";

export default async function AdminUploadsPage() {
  const events = await getAdminEventOptions();

  return (
    <UploadDropzone
      events={events.map((event) => ({
        ...event,
        eventDate: event.eventDate.toISOString().slice(0, 10),
      }))}
    />
  );
}
