import { createEventAction } from "@/app/admin/actions";
import { getResolvedRuntimeSettings } from "@/lib/app-settings";
import { EventForm } from "@/components/admin/event-form";

export default async function NewEventPage() {
  const runtimeSettings = await getResolvedRuntimeSettings();

  return (
    <EventForm
      title="Create a new event"
      description="Set the slug, visibility, and optional cover. Photo dates will set the timeline."
      submitLabel="Create event"
      action={createEventAction}
      initialValues={{
        visibility: runtimeSettings.defaultEventVisibility,
      }}
    />
  );
}
