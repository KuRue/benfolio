import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { bulkUpdatePhotoTags } from "@/lib/admin-tags";
import { getCurrentAdmin } from "@/lib/auth";
import {
  bulkDeletePhotos,
  bulkQueuePhotoReprocessing,
  bulkUpdatePhotoMetadata,
  movePhotosToEvent,
  setEventCoverFromPhoto,
} from "@/lib/admin-photo-operations";
import { prisma } from "@/lib/prisma";

const tagDraftSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  slug: z.string().min(1).optional(),
  category: z.enum(["CHARACTER", "EVENT", "SPECIES", "MAKER", "GENERAL"]),
});

const bulkPhotoActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("delete"),
    photoIds: z.array(z.string().min(1)).min(1).max(100),
  }),
  z.object({
    action: z.literal("retry-failed"),
    photoIds: z.array(z.string().min(1)).min(1).max(100),
  }),
  z.object({
    action: z.literal("reprocess-ready"),
    photoIds: z.array(z.string().min(1)).min(1).max(100),
  }),
  z.object({
    action: z.literal("set-cover"),
    photoIds: z.array(z.string().min(1)).length(1),
  }),
  z.object({
    action: z.literal("set-caption"),
    photoIds: z.array(z.string().min(1)).min(1).max(100),
    caption: z.string(),
  }),
  z.object({
    action: z.literal("clear-caption"),
    photoIds: z.array(z.string().min(1)).min(1).max(100),
  }),
  z.object({
    action: z.literal("set-alt-text"),
    photoIds: z.array(z.string().min(1)).min(1).max(100),
    altText: z.string(),
  }),
  z.object({
    action: z.literal("clear-alt-text"),
    photoIds: z.array(z.string().min(1)).min(1).max(100),
  }),
  z.object({
    action: z.literal("clear-taken-at-override"),
    photoIds: z.array(z.string().min(1)).min(1).max(100),
  }),
  z.object({
    action: z.literal("move-to-event"),
    photoIds: z.array(z.string().min(1)).min(1).max(100),
    destinationEventId: z.string().min(1),
  }),
  z.object({
    action: z.literal("add-tags"),
    photoIds: z.array(z.string().min(1)).min(1).max(100),
    tags: z.array(tagDraftSchema).min(1).max(20),
  }),
  z.object({
    action: z.literal("remove-tags"),
    photoIds: z.array(z.string().min(1)).min(1).max(100),
    tags: z.array(tagDraftSchema).min(1).max(20),
  }),
]);

function asOptionalString(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function uniquePhotoIds(photoIds: string[]) {
  return [...new Set(photoIds.map((photoId) => photoId.trim()).filter(Boolean))];
}

type PhotoContext = {
  id: string;
  eventId: string;
  processingState: string;
  event: {
    slug: string;
    visibility: "DRAFT" | "HIDDEN" | "PUBLIC";
  };
};

async function loadPhotoContexts(photoIds: string[]): Promise<PhotoContext[]> {
  return prisma.photo.findMany({
    where: {
      id: {
        in: photoIds,
      },
    },
    select: {
      id: true,
      eventId: true,
      processingState: true,
      event: {
        select: {
          slug: true,
          visibility: true,
        },
      },
    },
  });
}

async function loadEventContext(eventId: string) {
  return prisma.event.findUnique({
    where: {
      id: eventId,
    },
    select: {
      id: true,
      slug: true,
      visibility: true,
    },
  });
}

/**
 * Revalidate the caches affected by a photo action. Public paths (`/` and
 * per-event `/e/{slug}`) are only invalidated when at least one affected event
 * is PUBLIC — editing a DRAFT event shouldn't thrash the homepage cache.
 */
function revalidatePhotoContexts(
  contexts: PhotoContext[],
  options?: {
    includeHomepage?: boolean;
    includeDashboard?: boolean;
    includeSettings?: boolean;
  },
) {
  revalidatePath("/admin/events");
  revalidatePath("/admin/duplicates");

  if (options?.includeDashboard) {
    revalidatePath("/admin");
  }

  if (options?.includeSettings) {
    revalidatePath("/admin/settings");
  }

  const uniqueEvents = new Map(
    contexts.map((context) => [
      context.eventId,
      {
        slug: context.event.slug,
        visibility: context.event.visibility,
      },
    ]),
  );

  const anyPublic = [...uniqueEvents.values()].some(
    (event) => event.visibility === "PUBLIC",
  );

  if (options?.includeHomepage && anyPublic) {
    revalidatePath("/");
  }

  for (const [eventId, event] of uniqueEvents) {
    revalidatePath(`/admin/events/${eventId}`);
    if (event.visibility === "PUBLIC") {
      revalidatePath(`/e/${event.slug}`);
    }
  }

  for (const context of contexts) {
    revalidatePath(`/p/${context.id}`);
  }
}

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bulkPhotoActionSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid bulk photo payload." }, { status: 400 });
  }

  const photoIds = uniquePhotoIds(parsed.data.photoIds);
  const photoContexts = await loadPhotoContexts(photoIds);

  if (!photoContexts.length) {
    return NextResponse.json({ error: "Photos not found." }, { status: 404 });
  }

  try {
    switch (parsed.data.action) {
      case "delete": {
        const { deletedIds } = await bulkDeletePhotos(
          photoContexts.map((photo) => photo.id),
        );

        const deletedContexts = photoContexts.filter((photo) =>
          deletedIds.includes(photo.id),
        );

        revalidatePhotoContexts(deletedContexts, {
          includeHomepage: true,
          includeDashboard: true,
          includeSettings: true,
        });

        return NextResponse.json({
          message:
            deletedIds.length === 1
              ? "Photo deleted."
              : `${deletedIds.length} photos deleted.`,
          summary: {
            updatedCount: deletedIds.length,
            skippedCount: photoIds.length - deletedIds.length,
          },
        });
      }

      case "retry-failed": {
        const result = await bulkQueuePhotoReprocessing({
          photoIds,
          allowedStates: ["FAILED"],
        });

        if (!result.queuedIds.length) {
          return NextResponse.json(
            { error: "No failed photos were selected." },
            { status: 400 },
          );
        }

        const queuedContexts = photoContexts.filter((photo) =>
          result.queuedIds.includes(photo.id),
        );
        revalidatePhotoContexts(queuedContexts);

        return NextResponse.json({
          message:
            result.skippedCount > 0
              ? `Queued ${result.queuedIds.length} failed photos. ${result.skippedCount} selected photos were not eligible.`
              : `Queued ${result.queuedIds.length} failed photos for retry.`,
          summary: {
            updatedCount: result.queuedIds.length,
            skippedCount: result.skippedCount,
          },
        });
      }

      case "reprocess-ready": {
        const result = await bulkQueuePhotoReprocessing({
          photoIds,
          allowedStates: ["READY"],
        });

        if (!result.queuedIds.length) {
          return NextResponse.json(
            { error: "No ready photos were selected." },
            { status: 400 },
          );
        }

        const queuedContexts = photoContexts.filter((photo) =>
          result.queuedIds.includes(photo.id),
        );
        revalidatePhotoContexts(queuedContexts);

        return NextResponse.json({
          message:
            result.skippedCount > 0
              ? `Queued ${result.queuedIds.length} ready photos for reprocessing. ${result.skippedCount} selected photos were not eligible.`
              : `Queued ${result.queuedIds.length} ready photos for reprocessing.`,
          summary: {
            updatedCount: result.queuedIds.length,
            skippedCount: result.skippedCount,
          },
        });
      }

      case "set-cover": {
        const [photo] = photoContexts;

        if (!photo) {
          return NextResponse.json({ error: "Photo not found." }, { status: 404 });
        }

        await setEventCoverFromPhoto(photo.id);

        revalidatePhotoContexts([photo], {
          includeHomepage: true,
          includeDashboard: true,
        });

        return NextResponse.json({
          message: "Event cover updated.",
          summary: {
            updatedCount: 1,
            skippedCount: 0,
          },
        });
      }

      case "move-to-event": {
        const destinationEventId = parsed.data.destinationEventId.trim();
        const result = await movePhotosToEvent({
          photoIds,
          destinationEventId,
        });

        if (!result.movedIds.length) {
          return NextResponse.json(
            { error: "No selected photos were moved." },
            { status: 400 },
          );
        }

        const [movedContexts, destinationEvent] = await Promise.all([
          loadPhotoContexts(result.movedIds),
          loadEventContext(destinationEventId),
        ]);

        revalidatePhotoContexts([...photoContexts, ...movedContexts], {
          includeHomepage: true,
          includeDashboard: true,
        });

        if (destinationEvent) {
          revalidatePath(`/admin/events/${destinationEvent.id}`);
          if (destinationEvent.visibility === "PUBLIC") {
            revalidatePath(`/e/${destinationEvent.slug}`);
          }
        }

        return NextResponse.json({
          message:
            result.skippedCount > 0
              ? `Moved ${result.movedIds.length} photos. ${result.skippedCount} selected photos were already in that event or unavailable.`
              : `Moved ${result.movedIds.length} photos to ${destinationEvent?.slug ?? "the destination event"}.`,
          summary: {
            updatedCount: result.movedIds.length,
            skippedCount: result.skippedCount,
            destinationEventId,
          },
        });
      }

      case "add-tags":
      case "remove-tags": {
        const result = await bulkUpdatePhotoTags({
          photoIds,
          add: parsed.data.action === "add-tags" ? parsed.data.tags : undefined,
          remove: parsed.data.action === "remove-tags" ? parsed.data.tags : undefined,
        });

        if (!result.updatedPhotoIds.length) {
          return NextResponse.json({ error: "Photos not found." }, { status: 404 });
        }

        revalidatePhotoContexts(photoContexts, {
          includeHomepage: true,
          includeDashboard: true,
        });

        return NextResponse.json({
          message:
            parsed.data.action === "add-tags"
              ? `Updated tags on ${result.updatedPhotoIds.length} photos.`
              : `Removed selected tags from ${result.updatedPhotoIds.length} photos.`,
          summary: {
            updatedCount: result.updatedPhotoIds.length,
            skippedCount: photoIds.length - result.updatedPhotoIds.length,
            addedTagCount: result.addedTagCount,
            removedTagCount: result.removedTagCount,
          },
        });
      }

      case "set-caption":
      case "clear-caption":
      case "set-alt-text":
      case "clear-alt-text":
      case "clear-taken-at-override": {
        const result = await bulkUpdatePhotoMetadata({
          photoIds,
          fields:
            parsed.data.action === "set-caption" || parsed.data.action === "clear-caption"
              ? ["caption"]
              : parsed.data.action === "set-alt-text" ||
                  parsed.data.action === "clear-alt-text"
                ? ["altText"]
                : ["takenAtOverride"],
          caption:
            parsed.data.action === "set-caption"
              ? asOptionalString(parsed.data.caption)
              : undefined,
          altText:
            parsed.data.action === "set-alt-text"
              ? asOptionalString(parsed.data.altText)
              : undefined,
          takenAtOverride:
            parsed.data.action === "clear-taken-at-override" ? null : undefined,
        });

        const updatedContexts = photoContexts.filter((photo) =>
          result.updatedIds.includes(photo.id),
        );
        revalidatePhotoContexts(updatedContexts);

        const message =
          parsed.data.action === "set-caption"
            ? `Updated caption for ${result.updatedIds.length} photos.`
            : parsed.data.action === "clear-caption"
              ? `Cleared captions on ${result.updatedIds.length} photos.`
              : parsed.data.action === "set-alt-text"
                ? `Updated alt text for ${result.updatedIds.length} photos.`
                : parsed.data.action === "clear-alt-text"
                  ? `Cleared alt text on ${result.updatedIds.length} photos.`
                  : `Cleared taken time overrides on ${result.updatedIds.length} photos.`;

        return NextResponse.json({
          message,
          summary: {
            updatedCount: result.updatedIds.length,
            skippedCount: photoIds.length - result.updatedIds.length,
          },
        });
      }
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to apply bulk photo action.",
      },
      { status: 500 },
    );
  }
}
