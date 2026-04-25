import { FurtrackMatchTestPanel } from "@/components/admin/furtrack-match-test-panel";
import { getAdminFurtrackSettings } from "@/lib/admin-furtrack-settings";
import { getAdminEventOptions } from "@/lib/admin-data";
import { getAdminFurtrackCacheSummary } from "@/lib/furtrack-cache";

export default async function FurtrackMatchTestPage() {
  const [events, furtrackSettings, furtrackCache] = await Promise.all([
    getAdminEventOptions(),
    getAdminFurtrackSettings(),
    getAdminFurtrackCacheSummary(),
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
      furtrackCache={furtrackCache}
    />
  );
}
