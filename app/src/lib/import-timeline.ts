import "server-only";

import type { Prisma } from "../../../prisma/generated/client/client";

import { prisma } from "@/lib/prisma";

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

export async function recordImportJobEvents(
  importJobId: string,
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

  const items = await prisma.importItem.findMany({
    where: {
      importJobId,
      id: {
        in: entries.map((entry) => entry.importItemId),
      },
    },
    select: {
      id: true,
    },
  });

  const allowedIds = new Set(items.map((item) => item.id));

  await prisma.importItemEvent.createMany({
    data: entries.filter((entry) => allowedIds.has(entry.importItemId)),
  });
}
