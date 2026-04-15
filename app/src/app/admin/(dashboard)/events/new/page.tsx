import { createEventAction } from "@/app/admin/actions";
import { EventForm } from "@/components/admin/event-form";

export default function NewEventPage() {
  return (
    <EventForm
      title="Create a new event"
      description="Define the public slug, date, location, visibility, and optional cover image before uploads start landing."
      submitLabel="Create event"
      action={createEventAction}
    />
  );
}
