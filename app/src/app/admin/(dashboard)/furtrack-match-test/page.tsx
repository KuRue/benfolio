import { FurtrackMatchTestPanel } from "@/components/admin/furtrack-match-test-panel";
import { getAdminFurtrackSettings } from "@/lib/admin-furtrack-settings";
import { getAdminEventOptions } from "@/lib/admin-data";

export default async function FurtrackMatchTestPage() {
  const [events, furtrackSettings] = await Promise.all([
    getAdminEventOptions(),
    getAdminFurtrackSettings(),
  ]);

  return (
    <FurtrackMatchTestPanel
      events={events.map((event) => ({
        id: event.id,
        title: event.title,
        slug: event.slug,
        visibility: event.visibility,
        eventDateLabel: event.eventDateLabel,
      }))}
      furtrackSettings={furtrackSettings}
    />
  );
}
