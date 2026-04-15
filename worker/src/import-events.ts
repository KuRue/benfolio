import { Prisma } from "../../prisma/generated/client/client.ts";
import { prisma } from "./prisma.js";

export type ImportTimelineEventInput = {
  eventType: string;
  label: string;
  detail?: string | null;
  metadataJson?: Prisma.InputJsonValue | null;
  createdAt?: Date;
};

export async function recordImportItemEvents(
  importItemId: string,
  events: ImportTimelineEventInput[],
) {
  if (!events.length) {
    return;
  }

  await prisma.importItemEvent.createMany({
    data: events.map((event) => ({
      importItemId,
      eventType: event.eventType,
      label: event.label,
      detail: event.detail ?? null,
      metadataJson: event.metadataJson ?? undefined,
      createdAt: event.createdAt ?? new Date(),
    })),
  });
}

export async function recordManyImportItemEvents(
  eventsByItemId: Record<string, ImportTimelineEventInput[]>,
) {
  const entries = Object.entries(eventsByItemId).flatMap(([importItemId, events]) =>
    events.map((event) => ({
      importItemId,
      eventType: event.eventType,
      label: event.label,
      detail: event.detail ?? null,
      metadataJson: event.metadataJson ?? undefined,
      createdAt: event.createdAt ?? new Date(),
    })),
  );

  if (!entries.length) {
    return;
  }

  await prisma.importItemEvent.createMany({
    data: entries,
  });
}
