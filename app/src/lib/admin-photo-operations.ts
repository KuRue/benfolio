import "server-only";

import { Buffer } from "node:buffer";

import sharp from "sharp";

import { enqueuePhotoProcessing } from "@/lib/queue";
import { prisma } from "@/lib/prisma";
import { getAutoSortedPhotoIds, getEffectiveTakenAt } from "@/lib/photo-order";
import {
  deleteObjects,
  extensionFromFilename,
  storageBuckets,
  uploadObject,
} from "@/lib/storage";

type ProfileImageSlot = "cover" | "avatar" | "logo";
type ReprocessableState = "READY" | "FAILED";
type BulkMetadataField = "caption" | "altText" | "takenAtOverride";

type PhotoAssetMatch = {
  originalKey: string;
  derivatives: Array<{
    storageKey: string;
  }>;
};

function pickDerivative(
  derivatives: Array<{
    kind: string;
    width: number;
    height: number;
    storageKey: string;
  }>,
  preferredKinds: string[],
) {
  for (const preferredKind of preferredKinds) {
    const match = derivatives
      .filter((derivative) => derivative.kind === preferredKind)
      .sort((left, right) => right.width - left.width)[0];

    if (match) {
      return match;
    }
  }

  return [...derivatives].sort((left, right) => right.width - left.width)[0] ?? null;
}

function profileFieldsFromImage(
  slot: ProfileImageSlot,
  image: {
    originalKey: string;
    displayKey: string;
  },
) {
  if (slot === "cover") {
    return {
      coverOriginalKey: image.originalKey,
      coverDisplayKey: image.displayKey,
    };
  }

  if (slot === "avatar") {
    return {
      avatarOriginalKey: image.originalKey,
      avatarDisplayKey: image.displayKey,
    };
  }

  return {
    logoOriginalKey: image.originalKey,
    logoDisplayKey: image.displayKey,
  };
}

function getProfileSlotKeys(
  slot: ProfileImageSlot,
  profile: {
    coverOriginalKey: string | null;
    coverDisplayKey: string | null;
    avatarOriginalKey: string | null;
    avatarDisplayKey: string | null;
    logoOriginalKey: string | null;
    logoDisplayKey: string | null;
  },
) {
  if (slot === "cover") {
    return {
      originalKey: profile.coverOriginalKey,
      displayKey: profile.coverDisplayKey,
    };
  }

  if (slot === "avatar") {
    return {
      originalKey: profile.avatarOriginalKey,
      displayKey: profile.avatarDisplayKey,
    };
  }

  return {
    originalKey: profile.logoOriginalKey,
    displayKey: profile.logoDisplayKey,
  };
}

function isOwnedProfileStorageKey(slot: ProfileImageSlot, key: string | null) {
  return Boolean(key?.startsWith(`site-profile/${slot}/`));
}

async function cleanupOwnedProfileImages(
  slot: ProfileImageSlot,
  profile: {
    coverOriginalKey: string | null;
    coverDisplayKey: string | null;
    avatarOriginalKey: string | null;
    avatarDisplayKey: string | null;
    logoOriginalKey: string | null;
    logoDisplayKey: string | null;
  } | null,
) {
  if (!profile) {
    return;
  }

  const keys = getProfileSlotKeys(slot, profile);

  await Promise.all([
    deleteObjects({
      bucket: storageBuckets.originals,
      keys: isOwnedProfileStorageKey(slot, keys.originalKey)
        ? [keys.originalKey as string]
        : [],
    }),
    deleteObjects({
      bucket: storageBuckets.derivatives,
      keys: isOwnedProfileStorageKey(slot, keys.displayKey)
        ? [keys.displayKey as string]
        : [],
    }),
  ]);
}

async function renumberPhotoOrderByIds(photoIds: string[]) {
  await prisma.$transaction(
    photoIds.map((photoId, index) =>
      prisma.photo.update({
        where: { id: photoId },
        data: {
          sortOrder: index,
        },
      }),
    ),
  );
}

function dedupePhotoIds(photoIds: string[]) {
  return [...new Set(photoIds.map((photoId) => photoId.trim()).filter(Boolean))];
}

function photoMatchesStoredAsset(
  photo: PhotoAssetMatch,
  asset: {
    originalKey: string | null;
    displayKey: string | null;
  },
) {
  return (
    photo.originalKey === asset.originalKey ||
    photo.derivatives.some((derivative) => derivative.storageKey === asset.displayKey)
  );
}

function comparePhotosForDestinationOrder(
  left: {
    id: string;
    sortOrder: number;
    createdAt: Date;
    capturedAt: Date | null;
    takenAtOverride: Date | null;
  },
  right: {
    id: string;
    sortOrder: number;
    createdAt: Date;
    capturedAt: Date | null;
    takenAtOverride: Date | null;
  },
) {
  const leftTakenAt = getEffectiveTakenAt(left)?.getTime() ?? left.createdAt.getTime();
  const rightTakenAt = getEffectiveTakenAt(right)?.getTime() ?? right.createdAt.getTime();

  if (leftTakenAt !== rightTakenAt) {
    return leftTakenAt - rightTakenAt;
  }

  if (left.createdAt.getTime() !== right.createdAt.getTime()) {
    return left.createdAt.getTime() - right.createdAt.getTime();
  }

  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }

  return left.id.localeCompare(right.id);
}

export async function syncEventPhotoOrder(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      photoOrderMode: true,
    },
  });

  if (!event) {
    return;
  }

  const photos = await prisma.photo.findMany({
    where: { eventId },
    select: {
      id: true,
      createdAt: true,
      capturedAt: true,
      takenAtOverride: true,
      sortOrder: true,
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  if (!photos.length) {
    return;
  }

  const orderedIds =
    event.photoOrderMode === "AUTO"
      ? getAutoSortedPhotoIds(photos)
      : photos.map((photo) => photo.id);

  await renumberPhotoOrderByIds(orderedIds);
}

async function setFallbackEventCover(eventId: string) {
  const fallback = await prisma.photo.findFirst({
    where: {
      eventId,
      processingState: "READY",
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      derivatives: true,
    },
  });

  if (!fallback) {
    await prisma.event.update({
      where: { id: eventId },
      data: {
        coverOriginalKey: null,
        coverDisplayKey: null,
        coverWidth: null,
        coverHeight: null,
      },
    });
    return;
  }

  const derivative = pickDerivative(fallback.derivatives, ["VIEWER", "GRID", "THUMBNAIL"]);

  await prisma.event.update({
    where: { id: eventId },
    data: {
      coverOriginalKey: fallback.originalKey,
      coverDisplayKey: derivative?.storageKey ?? null,
      coverWidth: derivative?.width ?? fallback.width ?? null,
      coverHeight: derivative?.height ?? fallback.height ?? null,
    },
  });
}

export async function setEventCoverFromPhoto(photoId: string) {
  const photo = await prisma.photo.findUnique({
    where: { id: photoId },
    include: {
      derivatives: true,
    },
  });

  if (!photo) {
    throw new Error("Photo not found.");
  }

  const derivative = pickDerivative(photo.derivatives, ["VIEWER", "GRID", "THUMBNAIL"]);

  if (!derivative) {
    throw new Error("This photo does not have processed derivatives yet.");
  }

  await prisma.event.update({
    where: { id: photo.eventId },
    data: {
      coverOriginalKey: photo.originalKey,
      coverDisplayKey: derivative.storageKey,
      coverWidth: derivative.width,
      coverHeight: derivative.height,
    },
  });
}

export async function storeSiteProfileImage(
  slot: ProfileImageSlot,
  file: File,
) {
  const existingProfile = await prisma.siteProfile.findUnique({
    where: { id: "default" },
  });
  const buffer = Buffer.from(await file.arrayBuffer());
  const extension = extensionFromFilename(file.name);
  const version = Date.now();
  const originalKey = `site-profile/${slot}/${version}-original.${extension}`;
  const displayKey = `site-profile/${slot}/${version}-display.webp`;

  const image = sharp(buffer).rotate();
  const displayBuffer = await image
    .clone()
    .resize({
      width: slot === "cover" ? 2200 : slot === "logo" ? 700 : 900,
      withoutEnlargement: true,
    })
    .webp({ quality: slot === "cover" ? 86 : slot === "logo" ? 92 : 84 })
    .toBuffer();

  await Promise.all([
    uploadObject({
      bucket: storageBuckets.originals,
      key: originalKey,
      body: buffer,
      contentType: file.type || "application/octet-stream",
      cacheControl: "private, max-age=0, no-store",
    }),
    uploadObject({
      bucket: storageBuckets.derivatives,
      key: displayKey,
      body: displayBuffer,
      contentType: "image/webp",
      cacheControl: "public, max-age=31536000, immutable",
    }),
  ]);

  await cleanupOwnedProfileImages(slot, existingProfile);

  await prisma.siteProfile.upsert({
    where: { id: "default" },
    update: profileFieldsFromImage(slot, { originalKey, displayKey }),
    create: {
      id: "default",
      ...profileFieldsFromImage(slot, { originalKey, displayKey }),
    },
  });
}

export async function setSiteProfileImageFromPhoto(
  slot: ProfileImageSlot,
  photoId: string,
) {
  const existingProfile = await prisma.siteProfile.findUnique({
    where: { id: "default" },
  });
  const photo = await prisma.photo.findUnique({
    where: { id: photoId },
    include: {
      derivatives: true,
    },
  });

  if (!photo) {
    throw new Error("Photo not found.");
  }

  const derivative = pickDerivative(
    photo.derivatives,
    slot === "cover" ? ["VIEWER", "GRID", "THUMBNAIL"] : ["THUMBNAIL", "GRID", "VIEWER"],
  );

  if (!derivative) {
    throw new Error("Choose a processed photo for profile imagery.");
  }

  await cleanupOwnedProfileImages(slot, existingProfile);

  await prisma.siteProfile.upsert({
    where: { id: "default" },
    update: profileFieldsFromImage(slot, {
      originalKey: photo.originalKey,
      displayKey: derivative.storageKey,
    }),
    create: {
      id: "default",
      ...profileFieldsFromImage(slot, {
        originalKey: photo.originalKey,
        displayKey: derivative.storageKey,
      }),
    },
  });
}

export async function queuePhotoReprocessing(photoId: string) {
  const photo = await prisma.photo.findUnique({
    where: { id: photoId },
    select: {
      id: true,
    },
  });

  if (!photo) {
    throw new Error("Photo not found.");
  }

  await prisma.photo.update({
    where: { id: photoId },
    data: {
      processingState: "UPLOADED",
      errorMessage: null,
      processedAt: null,
    },
  });

  await enqueuePhotoProcessing(photoId);
}

export async function bulkQueuePhotoReprocessing(args: {
  photoIds: string[];
  allowedStates: ReprocessableState[];
}) {
  const photoIds = dedupePhotoIds(args.photoIds);

  if (!photoIds.length) {
    return {
      queuedIds: [] as string[],
      skippedCount: 0,
      eventIds: [] as string[],
    };
  }

  const photos = await prisma.photo.findMany({
    where: {
      id: {
        in: photoIds,
      },
    },
    select: {
      id: true,
      eventId: true,
      processingState: true,
    },
  });

  const eligiblePhotos = photos.filter((photo) =>
    args.allowedStates.includes(photo.processingState as ReprocessableState),
  );

  if (!eligiblePhotos.length) {
    return {
      queuedIds: [] as string[],
      skippedCount: photoIds.length,
      eventIds: [] as string[],
    };
  }

  const queuedIds = eligiblePhotos.map((photo) => photo.id);

  await prisma.photo.updateMany({
    where: {
      id: {
        in: queuedIds,
      },
    },
    data: {
      processingState: "UPLOADED",
      errorMessage: null,
      processedAt: null,
    },
  });

  await Promise.all(queuedIds.map((photoId) => enqueuePhotoProcessing(photoId)));

  return {
    queuedIds,
    skippedCount: photoIds.length - queuedIds.length,
    eventIds: [...new Set(eligiblePhotos.map((photo) => photo.eventId))],
  };
}

export async function updatePhotoMetadata(args: {
  photoId: string;
  caption: string | null;
  altText: string | null;
  takenAtOverride: Date | null;
}) {
  const photo = await prisma.photo.update({
    where: { id: args.photoId },
    data: {
      caption: args.caption,
      altText: args.altText,
      takenAtOverride: args.takenAtOverride,
    },
    select: {
      eventId: true,
    },
  });

  await syncEventPhotoOrder(photo.eventId);
}

export async function bulkUpdatePhotoMetadata(args: {
  photoIds: string[];
  fields: BulkMetadataField[];
  caption?: string | null;
  altText?: string | null;
  takenAtOverride?: Date | null;
}) {
  const photoIds = dedupePhotoIds(args.photoIds);

  if (!photoIds.length || !args.fields.length) {
    return {
      updatedIds: [] as string[],
      eventIds: [] as string[],
    };
  }

  const photos = await prisma.photo.findMany({
    where: {
      id: {
        in: photoIds,
      },
    },
    select: {
      id: true,
      eventId: true,
    },
  });

  if (!photos.length) {
    return {
      updatedIds: [] as string[],
      eventIds: [] as string[],
    };
  }

  const data: {
    caption?: string | null;
    altText?: string | null;
    takenAtOverride?: Date | null;
  } = {};

  if (args.fields.includes("caption")) {
    data.caption = args.caption ?? null;
  }

  if (args.fields.includes("altText")) {
    data.altText = args.altText ?? null;
  }

  if (args.fields.includes("takenAtOverride")) {
    data.takenAtOverride = args.takenAtOverride ?? null;
  }

  const updatedIds = photos.map((photo) => photo.id);

  await prisma.photo.updateMany({
    where: {
      id: {
        in: updatedIds,
      },
    },
    data,
  });

  const eventIds = [...new Set(photos.map((photo) => photo.eventId))];

  await Promise.all(eventIds.map((eventId) => syncEventPhotoOrder(eventId)));

  return {
    updatedIds,
    eventIds,
  };
}

export async function movePhotoWithinEvent(args: {
  eventId: string;
  photoId: string;
  direction: "earlier" | "later";
}) {
  const event = await prisma.event.findUnique({
    where: { id: args.eventId },
    select: { id: true },
  });

  if (!event) {
    throw new Error("Event not found.");
  }

  const photos = await prisma.photo.findMany({
    where: { eventId: args.eventId },
    select: {
      id: true,
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const currentIndex = photos.findIndex((photo) => photo.id === args.photoId);

  if (currentIndex === -1) {
    throw new Error("Photo not found.");
  }

  const targetIndex =
    args.direction === "earlier" ? currentIndex - 1 : currentIndex + 1;

  if (targetIndex < 0 || targetIndex >= photos.length) {
    return;
  }

  const reordered = [...photos];
  const [photo] = reordered.splice(currentIndex, 1);
  reordered.splice(targetIndex, 0, photo);

  await prisma.$transaction([
    prisma.event.update({
      where: { id: args.eventId },
      data: { photoOrderMode: "MANUAL" },
    }),
    ...reordered.map((entry, index) =>
      prisma.photo.update({
        where: { id: entry.id },
        data: {
          sortOrder: index,
        },
      }),
    ),
  ]);
}

export async function resetEventPhotoOrderToAutomatic(eventId: string) {
  await prisma.event.update({
    where: { id: eventId },
    data: {
      photoOrderMode: "AUTO",
    },
  });

  await syncEventPhotoOrder(eventId);
}

export async function deletePhotoSafely(photoId: string) {
  const photo = await prisma.photo.findUnique({
    where: { id: photoId },
    include: {
      event: true,
      derivatives: true,
    },
  });

  if (!photo) {
    throw new Error("Photo not found.");
  }

  const derivativeKeys = photo.derivatives.map((derivative) => derivative.storageKey);

  await Promise.all([
    deleteObjects({
      bucket: storageBuckets.originals,
      keys: [photo.originalKey],
    }),
    deleteObjects({
      bucket: storageBuckets.derivatives,
      keys: derivativeKeys,
    }),
  ]);

  await prisma.photo.delete({
    where: { id: photoId },
  });

  const profile = await prisma.siteProfile.findUnique({
    where: { id: "default" },
  });

  if (profile) {
    const clearCover =
      profile.coverOriginalKey === photo.originalKey ||
      derivativeKeys.includes(profile.coverDisplayKey ?? "");
    const clearAvatar =
      profile.avatarOriginalKey === photo.originalKey ||
      derivativeKeys.includes(profile.avatarDisplayKey ?? "");

    if (clearCover || clearAvatar) {
      await prisma.siteProfile.update({
        where: { id: "default" },
        data: {
          ...(clearCover
            ? {
                coverOriginalKey: null,
                coverDisplayKey: null,
              }
            : {}),
          ...(clearAvatar
            ? {
                avatarOriginalKey: null,
                avatarDisplayKey: null,
              }
            : {}),
        },
      });
    }
  }

  const wasEventCover =
    photo.event.coverOriginalKey === photo.originalKey ||
    derivativeKeys.includes(photo.event.coverDisplayKey ?? "");

  await syncEventPhotoOrder(photo.eventId);

  if (wasEventCover) {
    await setFallbackEventCover(photo.eventId);
  }
}

export async function movePhotosToEvent(args: {
  photoIds: string[];
  destinationEventId: string;
}) {
  const photoIds = dedupePhotoIds(args.photoIds);

  if (!photoIds.length) {
    return {
      movedIds: [] as string[],
      skippedCount: 0,
      sourceEventIds: [] as string[],
      destinationEventId: args.destinationEventId,
      destinationEventSlug: null as string | null,
    };
  }

  const destinationEvent = await prisma.event.findUnique({
    where: { id: args.destinationEventId },
    select: {
      id: true,
      slug: true,
      coverOriginalKey: true,
      coverDisplayKey: true,
    },
  });

  if (!destinationEvent) {
    throw new Error("Destination event not found.");
  }

  const photos = await prisma.photo.findMany({
    where: {
      id: {
        in: photoIds,
      },
    },
    select: {
      id: true,
      eventId: true,
      sortOrder: true,
      createdAt: true,
      capturedAt: true,
      takenAtOverride: true,
      originalKey: true,
      derivatives: {
        select: {
          storageKey: true,
        },
      },
      event: {
        select: {
          id: true,
          slug: true,
          coverOriginalKey: true,
          coverDisplayKey: true,
        },
      },
    },
  });

  const movingPhotos = photos
    .filter((photo) => photo.eventId !== destinationEvent.id)
    .sort(comparePhotosForDestinationOrder);

  if (!movingPhotos.length) {
    return {
      movedIds: [] as string[],
      skippedCount: photoIds.length,
      sourceEventIds: [] as string[],
      destinationEventId: destinationEvent.id,
      destinationEventSlug: destinationEvent.slug,
    };
  }

  const movedIds = movingPhotos.map((photo) => photo.id);
  const movingPhotosById = new Map(movingPhotos.map((photo) => [photo.id, photo]));
  const sourceEventIds = [...new Set(movingPhotos.map((photo) => photo.eventId))];
  const sourceCoverEventIds = [
    ...new Set(
      movingPhotos
        .filter((photo) =>
          photoMatchesStoredAsset(photo, {
            originalKey: photo.event.coverOriginalKey,
            displayKey: photo.event.coverDisplayKey,
          }),
        )
        .map((photo) => photo.eventId),
    ),
  ];
  const destinationHadCover = Boolean(
    destinationEvent.coverOriginalKey || destinationEvent.coverDisplayKey,
  );

  await prisma.$transaction(async (tx) => {
    const destinationSortOrder = await tx.photo.aggregate({
      where: {
        eventId: destinationEvent.id,
      },
      _max: {
        sortOrder: true,
      },
    });
    const importItems = await tx.importItem.findMany({
      where: {
        photoId: {
          in: movedIds,
        },
      },
      select: {
        id: true,
        photoId: true,
        eventId: true,
      },
    });
    const baseSortOrder = (destinationSortOrder._max.sortOrder ?? -1) + 1;

    for (const [index, photo] of movingPhotos.entries()) {
      await tx.photo.update({
        where: {
          id: photo.id,
        },
        data: {
          eventId: destinationEvent.id,
          sortOrder: baseSortOrder + index,
        },
      });
    }

    await tx.importItem.updateMany({
      where: {
        photoId: {
          in: movedIds,
        },
      },
      data: {
        eventId: destinationEvent.id,
      },
    });

    await tx.externalAssetLink.updateMany({
      where: {
        photoId: {
          in: movedIds,
        },
      },
      data: {
        eventId: destinationEvent.id,
      },
    });

    if (importItems.length) {
      await tx.importItemEvent.createMany({
        data: importItems.map((item) => {
          const sourcePhoto = movingPhotosById.get(item.photoId ?? "");

          return {
            importItemId: item.id,
            eventType: "PHOTO_MOVED",
            label: "Photo moved between events",
            detail: `Moved from ${sourcePhoto?.event.slug ?? "unknown"} to ${destinationEvent.slug}.`,
            metadataJson: {
              fromEventId: sourcePhoto?.eventId ?? item.eventId ?? null,
              toEventId: destinationEvent.id,
              photoId: item.photoId ?? null,
            },
          };
        }),
      });
    }
  });

  for (const eventId of sourceEventIds) {
    await syncEventPhotoOrder(eventId);
  }

  for (const eventId of sourceCoverEventIds) {
    await setFallbackEventCover(eventId);
  }

  await syncEventPhotoOrder(destinationEvent.id);

  if (!destinationHadCover) {
    await setFallbackEventCover(destinationEvent.id);
  }

  return {
    movedIds,
    skippedCount: photoIds.length - movedIds.length,
    sourceEventIds,
    destinationEventId: destinationEvent.id,
    destinationEventSlug: destinationEvent.slug,
  };
}

export function getPhotoDisplayCapturedAt(photo: {
  capturedAt: Date | null;
  takenAtOverride: Date | null;
}) {
  return getEffectiveTakenAt(photo);
}
