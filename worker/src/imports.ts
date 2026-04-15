import { randomBytes } from "node:crypto";

import { Prisma } from "../../prisma/generated/client/client.ts";
import { env } from "./env.js";
import {
  recordImportItemEvents,
  recordManyImportItemEvents,
} from "./import-events.js";
import { prisma } from "./prisma.js";
import { copyObject, deleteObjects, headObject, storageBuckets } from "./storage.js";

const BASE62_ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const BASE62_LENGTH = BASE62_ALPHABET.length;

const IMPORT_LINK_ASSET_TYPE = "IMPORT_OBJECT";

type QueuePhotoProcessing = (photoId: string) => Promise<void>;

type ImportCleanupMode = "delete" | "archive";

type StorageImportPayload = {
  kind: "storage-import";
  version: 3;
  trigger: "scan" | "webhook";
  adapterId: string | null;
  eventSlug: string;
  sourcePrefix: string;
  cleanupMode: ImportCleanupMode;
  archivePrefix: string | null;
  files: Array<{
    sourceKey: string;
    filename: string;
    size: number;
    lastModified: string | null;
    bucket?: string | null;
    eventName?: string | null;
    deliveryId?: string | null;
    sourceProvider?: string | null;
    sourceEtag?: string | null;
    sourceVersion?: string | null;
  }>;
};

function logImport(
  level: "info" | "warn" | "error",
  event: string,
  data: Record<string, unknown>,
) {
  const message = JSON.stringify({
    scope: "imports.worker",
    event,
    at: new Date().toISOString(),
    ...data,
  });

  if (level === "error") {
    console.error(message);
    return;
  }

  if (level === "warn") {
    console.warn(message);
    return;
  }

  console.info(message);
}

function generatePhotoId(length = 12) {
  if (length < 10 || length > 12) {
    throw new Error("Photo IDs must be between 10 and 12 characters.");
  }

  let output = "";

  while (output.length < length) {
    const buffer = randomBytes(length);

    for (const byte of buffer) {
      if (byte >= BASE62_LENGTH * 4) {
        continue;
      }

      output += BASE62_ALPHABET[byte % BASE62_LENGTH];

      if (output.length === length) {
        break;
      }
    }
  }

  return output;
}

function normalizePrefix(prefix: string) {
  return prefix.endsWith("/") ? prefix : `${prefix}/`;
}

function extensionFromFilename(filename: string) {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.at(-1)?.toLowerCase() ?? "jpg" : "jpg";
}

function buildImportArchiveKey(sourceKey: string) {
  const importsPrefix = normalizePrefix(env.IMPORTS_PREFIX);
  const archivePrefix = normalizePrefix(env.IMPORTS_ARCHIVE_PREFIX);

  if (!sourceKey.startsWith(importsPrefix)) {
    return `${archivePrefix}${sourceKey}`;
  }

  return `${archivePrefix}${sourceKey.slice(importsPrefix.length)}`;
}

function parseStorageImportPayload(payload: unknown): StorageImportPayload | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  const version =
    candidate.version === 3
      ? 3
      : candidate.version === 2
        ? 2
        : candidate.version === 1
          ? 1
          : null;
  const trigger = candidate.trigger === "webhook" ? "webhook" : "scan";

  if (
    candidate.kind !== "storage-import" ||
    version === null ||
    typeof candidate.eventSlug !== "string" ||
    typeof candidate.sourcePrefix !== "string" ||
    (candidate.cleanupMode !== "delete" && candidate.cleanupMode !== "archive") ||
    !Array.isArray(candidate.files)
  ) {
    return null;
  }

  const files = candidate.files
    .map((file) => {
      if (!file || typeof file !== "object" || Array.isArray(file)) {
        return null;
      }

      const entry = file as Record<string, unknown>;

      if (
        typeof entry.sourceKey !== "string" ||
        typeof entry.filename !== "string" ||
        typeof entry.size !== "number"
      ) {
        return null;
      }

      return {
        sourceKey: entry.sourceKey,
        filename: entry.filename,
        size: entry.size,
        lastModified:
          typeof entry.lastModified === "string" ? entry.lastModified : null,
        bucket: typeof entry.bucket === "string" ? entry.bucket : null,
        eventName: typeof entry.eventName === "string" ? entry.eventName : null,
        deliveryId:
          typeof entry.deliveryId === "string" ? entry.deliveryId : null,
        sourceProvider:
          typeof entry.sourceProvider === "string" ? entry.sourceProvider : null,
        sourceEtag: typeof entry.sourceEtag === "string" ? entry.sourceEtag : null,
        sourceVersion:
          typeof entry.sourceVersion === "string" ? entry.sourceVersion : null,
      };
    })
    .filter(Boolean) as StorageImportPayload["files"];

  return {
    kind: "storage-import",
    version: 3,
    trigger,
    adapterId: typeof candidate.adapterId === "string" ? candidate.adapterId : null,
    eventSlug: candidate.eventSlug,
    sourcePrefix: candidate.sourcePrefix,
    cleanupMode: candidate.cleanupMode,
    archivePrefix:
      typeof candidate.archivePrefix === "string" ? candidate.archivePrefix : null,
    files,
  };
}

function getMetadataRecord(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, unknown>;
  }

  return value as Record<string, unknown>;
}

function buildImportLinkMetadata(args: {
  importJobId: string;
  importItemId: string;
  sourceKey: string;
  cleanupMode: ImportCleanupMode;
}) {
  return {
    importJobId: args.importJobId,
    importItemId: args.importItemId,
    sourceKey: args.sourceKey,
    cleanupMode: args.cleanupMode,
    archiveKey:
      args.cleanupMode === "archive" ? buildImportArchiveKey(args.sourceKey) : null,
    cleanupStatus: "pending",
    cleanupError: null,
    cleanupCompletedAt: null,
  } as Prisma.InputJsonValue;
}

function mergeImportMetadata(
  currentValue: Prisma.JsonValue | null,
  updates: Record<string, unknown>,
) {
  return {
    ...getMetadataRecord(currentValue),
    ...updates,
  } as Prisma.InputJsonValue;
}

function summarizeErrors(messages: string[]) {
  return [...new Set(messages.filter(Boolean))].slice(0, 8).join("\n") || null;
}

async function refreshImportJobProgress(importJobId: string) {
  const [importJob, summary, failedItems] = await Promise.all([
    prisma.importJob.findUnique({
      where: { id: importJobId },
      select: {
        id: true,
        startedAt: true,
      },
    }),
    prisma.importItem.groupBy({
      by: ["status"],
      where: {
        importJobId,
      },
      _count: true,
    }),
    prisma.importItem.findMany({
      where: {
        importJobId,
        status: "FAILED",
      },
      select: {
        sourceKey: true,
        errorMessage: true,
        cleanupError: true,
      },
      take: 8,
    }),
  ]);

  if (!importJob) {
    return;
  }

  const counts = summary.reduce<Record<string, number>>((accumulator, row) => {
    accumulator[row.status] = row._count;
    return accumulator;
  }, {});

  const terminalCount =
    (counts.COMPLETE ?? 0) + (counts.FAILED ?? 0) + (counts.SKIPPED ?? 0);

  const status =
    (counts.RUNNING ?? 0) > 0
      ? "RUNNING"
      : (counts.PENDING ?? 0) > 0
        ? "PENDING"
        : (counts.FAILED ?? 0) > 0
          ? "FAILED"
          : "SUCCEEDED";
  const errorMessages = failedItems.flatMap((item) => {
    const messages: string[] = [];

    if (item.errorMessage) {
      messages.push(`${item.sourceKey}: ${item.errorMessage}`);
    }

    if (item.cleanupError) {
      messages.push(`${item.sourceKey}: ${item.cleanupError}`);
    }

    return messages;
  });

  await prisma.importJob.update({
    where: { id: importJobId },
    data: {
      status,
      processedItems: terminalCount,
      startedAt:
        status === "PENDING" ? importJob.startedAt : importJob.startedAt ?? new Date(),
      finishedAt: status === "SUCCEEDED" || status === "FAILED" ? new Date() : null,
      errorMessage: summarizeErrors(errorMessages),
    },
  });
}

async function requeueImportedPhoto(
  photoId: string,
  enqueuePhotoProcessing: QueuePhotoProcessing,
) {
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

async function markImportItemFailed(args: {
  itemId: string;
  errorMessage: string;
  cleanupStatus?: "NOT_REQUIRED" | "PENDING" | "FAILED";
  cleanupError?: string | null;
  photoId?: string | null;
  eventId?: string | null;
  contentHashSha256?: string | null;
}) {
  await prisma.importItem.update({
    where: { id: args.itemId },
    data: {
      status: "FAILED",
      errorMessage: args.errorMessage,
      cleanupStatus: args.cleanupStatus ?? "NOT_REQUIRED",
      cleanupError: args.cleanupError ?? null,
      photoId: args.photoId ?? undefined,
      eventId: args.eventId ?? undefined,
      contentHashSha256: args.contentHashSha256 ?? undefined,
      completedAt: new Date(),
    },
  });
}

async function markImportItemComplete(args: {
  itemId: string;
  cleanupStatus: "DELETED" | "ARCHIVED";
  cleanupTargetKey: string | null;
  photoId?: string | null;
  eventId?: string | null;
  contentHashSha256?: string | null;
}) {
  await prisma.importItem.update({
    where: { id: args.itemId },
    data: {
      status: "COMPLETE",
      errorMessage: null,
      cleanupError: null,
      cleanupStatus: args.cleanupStatus,
      cleanupTargetKey: args.cleanupTargetKey,
      photoId: args.photoId ?? undefined,
      eventId: args.eventId ?? undefined,
      contentHashSha256: args.contentHashSha256 ?? undefined,
      completedAt: new Date(),
    },
  });
}

async function cleanupImportSourceLink(args: {
  link: {
    id: string;
    externalId: string;
    metadataJson: Prisma.JsonValue | null;
  };
  importItem: {
    id: string;
    importJobId: string;
    cleanupMode: string | null;
    cleanupTargetKey: string | null;
  };
}) {
  const metadata = getMetadataRecord(args.link.metadataJson);
  const existingCleanupStatus =
    typeof metadata.cleanupStatus === "string" ? metadata.cleanupStatus : "pending";

  if (existingCleanupStatus === "completed") {
    const cleanupMode =
      args.importItem.cleanupMode === "archive" ? "archive" : env.IMPORTS_CLEANUP_MODE;
    const cleanupTargetKey =
      args.importItem.cleanupTargetKey ??
      (cleanupMode === "archive" ? buildImportArchiveKey(args.link.externalId) : null);

    await recordImportItemEvents(args.importItem.id, [
      {
        eventType: "cleanup.skipped",
        label: "Cleanup already completed",
        detail: cleanupTargetKey ?? args.link.externalId,
        metadataJson: {
          cleanupMode,
          cleanupTargetKey,
        } satisfies Prisma.InputJsonValue,
      },
    ]);

    return {
      cleanupStatus: cleanupMode === "archive" ? "ARCHIVED" : "DELETED",
      cleanupTargetKey,
    } as const;
  }

  const cleanupMode =
    args.importItem.cleanupMode === "archive" ? "archive" : env.IMPORTS_CLEANUP_MODE;
  const cleanupTargetKey =
    args.importItem.cleanupTargetKey ??
    (cleanupMode === "archive" ? buildImportArchiveKey(args.link.externalId) : null);

  try {
    if (cleanupMode === "archive" && cleanupTargetKey) {
      await copyObject({
        sourceBucket: storageBuckets.originals,
        sourceKey: args.link.externalId,
        destinationBucket: storageBuckets.originals,
        destinationKey: cleanupTargetKey,
      });
    }

    await deleteObjects({
      bucket: storageBuckets.originals,
      keys: [args.link.externalId],
    });

    await prisma.externalAssetLink.update({
      where: { id: args.link.id },
      data: {
        metadataJson: mergeImportMetadata(args.link.metadataJson, {
          importJobId: args.importItem.importJobId,
          importItemId: args.importItem.id,
          cleanupMode,
          archiveKey: cleanupTargetKey,
          cleanupStatus: "completed",
          cleanupError: null,
          cleanupCompletedAt: new Date().toISOString(),
        }),
      },
    });

    await recordImportItemEvents(args.importItem.id, [
      {
        eventType: "cleanup.completed",
        label: cleanupMode === "archive" ? "Source archived" : "Source deleted",
        detail: cleanupTargetKey ?? args.link.externalId,
        metadataJson: {
          cleanupMode,
          cleanupTargetKey,
        } satisfies Prisma.InputJsonValue,
      },
    ]);

    logImport("info", "import.cleanup.completed", {
      importItemId: args.importItem.id,
      sourceKey: args.link.externalId,
      cleanupMode,
      cleanupTargetKey,
    });

    return {
      cleanupStatus: cleanupMode === "archive" ? "ARCHIVED" : "DELETED",
      cleanupTargetKey,
    } as const;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Import cleanup failed.";

    await prisma.externalAssetLink.update({
      where: { id: args.link.id },
      data: {
        metadataJson: mergeImportMetadata(args.link.metadataJson, {
          importJobId: args.importItem.importJobId,
          importItemId: args.importItem.id,
          cleanupMode,
          archiveKey: cleanupTargetKey,
          cleanupStatus: "failed",
          cleanupError: message,
          cleanupLastAttemptAt: new Date().toISOString(),
        }),
      },
    });

    await recordImportItemEvents(args.importItem.id, [
      {
        eventType: "cleanup.failed",
        label: "Cleanup failed",
        detail: message,
        metadataJson: {
          cleanupMode,
          cleanupTargetKey,
        } satisfies Prisma.InputJsonValue,
      },
    ]);

    logImport("error", "import.cleanup.failed", {
      importItemId: args.importItem.id,
      sourceKey: args.link.externalId,
      cleanupMode,
      cleanupTargetKey,
      error: message,
    });

    throw new Error(message);
  }
}

async function processExistingImportLink(args: {
  importItem: {
    id: string;
    importJobId: string;
    eventId: string | null;
    sourceKey: string;
    cleanupMode: string | null;
    cleanupTargetKey: string | null;
  };
  existingLink: {
    id: string;
    externalId: string;
    eventId: string | null;
    metadataJson: Prisma.JsonValue | null;
    photo: {
      id: string;
      processingState: "UPLOADED" | "PROCESSING" | "READY" | "FAILED";
      errorMessage: string | null;
      contentHashSha256: string | null;
    } | null;
  };
  enqueuePhotoProcessing: QueuePhotoProcessing;
}) {
  if (!args.existingLink.photo) {
    await markImportItemFailed({
      itemId: args.importItem.id,
      eventId: args.existingLink.eventId,
      errorMessage: "Import link exists without an attached photo.",
    });
    await recordImportItemEvents(args.importItem.id, [
      {
        eventType: "item.failed",
        label: "Existing import link is incomplete",
        detail: args.importItem.sourceKey,
      },
    ]);
    return;
  }

  if (args.existingLink.photo.processingState === "READY") {
    await recordImportItemEvents(args.importItem.id, [
      {
        eventType: "photo.linked",
        label: "Linked to existing photo",
        detail: args.existingLink.photo.id,
        metadataJson: {
          photoId: args.existingLink.photo.id,
        } satisfies Prisma.InputJsonValue,
      },
      {
        eventType: "processing.completed",
        label: "Photo was already processed",
        metadataJson: {
          photoId: args.existingLink.photo.id,
          contentHashSha256: args.existingLink.photo.contentHashSha256,
        } satisfies Prisma.InputJsonValue,
      },
    ]);

    try {
      const cleanup = await cleanupImportSourceLink({
        link: args.existingLink,
        importItem: args.importItem,
      });

      await markImportItemComplete({
        itemId: args.importItem.id,
        photoId: args.existingLink.photo.id,
        eventId: args.existingLink.eventId,
        cleanupStatus: cleanup.cleanupStatus,
        cleanupTargetKey: cleanup.cleanupTargetKey,
        contentHashSha256: args.existingLink.photo.contentHashSha256,
      });
    } catch (error) {
      await markImportItemFailed({
        itemId: args.importItem.id,
        photoId: args.existingLink.photo.id,
        eventId: args.existingLink.eventId,
        errorMessage:
          error instanceof Error ? error.message : "Import cleanup failed.",
        cleanupStatus: "FAILED",
        cleanupError:
          error instanceof Error ? error.message : "Import cleanup failed.",
        contentHashSha256: args.existingLink.photo.contentHashSha256,
      });
    }

    return;
  }

  if (args.existingLink.photo.processingState === "FAILED") {
    await prisma.importItem.update({
      where: { id: args.importItem.id },
      data: {
        photoId: args.existingLink.photo.id,
        eventId: args.existingLink.eventId ?? args.importItem.eventId,
        status: "RUNNING",
        errorMessage: null,
        cleanupStatus: "NOT_REQUIRED",
        cleanupError: null,
        contentHashSha256: args.existingLink.photo.contentHashSha256,
      },
    });

    await recordImportItemEvents(args.importItem.id, [
      {
        eventType: "photo.linked",
        label: "Linked to existing failed photo",
        detail: args.existingLink.photo.id,
        metadataJson: {
          photoId: args.existingLink.photo.id,
        } satisfies Prisma.InputJsonValue,
      },
      {
        eventType: "processing.requeued",
        label: "Photo requeued for processing",
        detail: args.existingLink.photo.errorMessage,
      },
    ]);

    await requeueImportedPhoto(args.existingLink.photo.id, args.enqueuePhotoProcessing);

    logImport("info", "import.item.photo-requeued", {
      importItemId: args.importItem.id,
      sourceKey: args.importItem.sourceKey,
      photoId: args.existingLink.photo.id,
    });

    return;
  }

  await prisma.importItem.update({
    where: { id: args.importItem.id },
    data: {
      photoId: args.existingLink.photo.id,
      eventId: args.existingLink.eventId ?? args.importItem.eventId,
      status: "RUNNING",
      errorMessage: null,
      cleanupStatus: "NOT_REQUIRED",
      cleanupError: null,
      contentHashSha256: args.existingLink.photo.contentHashSha256,
    },
  });

  await recordImportItemEvents(args.importItem.id, [
    {
      eventType: "photo.linked",
      label: "Linked to existing photo",
      detail: args.existingLink.photo.id,
      metadataJson: {
        photoId: args.existingLink.photo.id,
      } satisfies Prisma.InputJsonValue,
    },
    {
      eventType: "processing.awaiting-existing",
      label: "Waiting for existing photo processing",
    },
  ]);
}

async function createPhotoFromImportItem(args: {
  importItem: {
    id: string;
    importJobId: string;
    eventId: string | null;
    sourceKey: string;
    sourceFilename: string;
    sourceByteSize: bigint | null;
    cleanupMode: string | null;
    cleanupTargetKey: string | null;
  };
  payload: StorageImportPayload;
  enqueuePhotoProcessing: QueuePhotoProcessing;
}) {
  if (!args.importItem.eventId) {
    throw new Error(`Import item ${args.importItem.id} is missing an event.`);
  }

  const fileEntry =
    args.payload.files.find((file) => file.sourceKey === args.importItem.sourceKey) ?? null;
  const filename = fileEntry?.filename ?? args.importItem.sourceFilename;

  let destinationKey: string | null = null;

  try {
    const photoId = generatePhotoId();
    const extension = extensionFromFilename(filename);
    destinationKey = `events/${args.importItem.eventId}/photos/${photoId}/original.${extension}`;
    const maxSortOrder = await prisma.photo.aggregate({
      where: {
        eventId: args.importItem.eventId,
      },
      _max: {
        sortOrder: true,
      },
    });

    const objectHead = await headObject(storageBuckets.originals, args.importItem.sourceKey);

    await copyObject({
      sourceBucket: storageBuckets.originals,
      sourceKey: args.importItem.sourceKey,
      destinationBucket: storageBuckets.originals,
      destinationKey,
    });

    await prisma.$transaction([
      prisma.photo.create({
        data: {
          id: photoId,
          eventId: args.importItem.eventId,
          originalKey: destinationKey,
          originalFilename: filename,
          originalMimeType: objectHead.contentType,
          originalByteSize: BigInt(
            objectHead.contentLength ?? args.importItem.sourceByteSize ?? 0n,
          ),
          sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
        },
      }),
      prisma.externalAssetLink.create({
        data: {
          source: "STORAGE_IMPORT",
          assetType: IMPORT_LINK_ASSET_TYPE,
          externalId: args.importItem.sourceKey,
          eventId: args.importItem.eventId,
          photoId,
          metadataJson: buildImportLinkMetadata({
            importJobId: args.importItem.importJobId,
            importItemId: args.importItem.id,
            sourceKey: args.importItem.sourceKey,
            cleanupMode:
              args.importItem.cleanupMode === "archive" ? "archive" : "delete",
          }),
        },
      }),
      prisma.importItem.update({
        where: { id: args.importItem.id },
        data: {
          photoId,
          status: "RUNNING",
          errorMessage: null,
          cleanupStatus: "NOT_REQUIRED",
          cleanupError: null,
        },
      }),
    ]);

    await recordImportItemEvents(args.importItem.id, [
      {
        eventType: "photo.created",
        label: "Photo row created",
        detail: photoId,
        metadataJson: {
          photoId,
          destinationKey,
        } satisfies Prisma.InputJsonValue,
      },
      {
        eventType: "processing.queued",
        label: "Photo queued for derivative processing",
        metadataJson: {
          photoId,
        } satisfies Prisma.InputJsonValue,
      },
    ]);

    await args.enqueuePhotoProcessing(photoId);

    logImport("info", "import.item.photo-created", {
      importItemId: args.importItem.id,
      importJobId: args.importItem.importJobId,
      sourceKey: args.importItem.sourceKey,
      photoId,
      destinationKey,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existingLink = await prisma.externalAssetLink.findUnique({
        where: {
          source_externalId_assetType: {
            source: "STORAGE_IMPORT",
            externalId: args.importItem.sourceKey,
            assetType: IMPORT_LINK_ASSET_TYPE,
          },
        },
        select: {
          id: true,
          externalId: true,
          eventId: true,
          metadataJson: true,
          photo: {
            select: {
              id: true,
              processingState: true,
              errorMessage: true,
              contentHashSha256: true,
            },
          },
        },
      });

      if (existingLink) {
        if (destinationKey) {
          await deleteObjects({
            bucket: storageBuckets.originals,
            keys: [destinationKey],
          });
        }

        logImport("warn", "import.item.deduped-after-race", {
          importItemId: args.importItem.id,
          sourceKey: args.importItem.sourceKey,
        });

        await recordImportItemEvents(args.importItem.id, [
          {
            eventType: "item.race-deduped",
            label: "Another worker claimed this source key first",
          },
        ]);

        await processExistingImportLink({
          importItem: args.importItem,
          existingLink,
          enqueuePhotoProcessing: args.enqueuePhotoProcessing,
        });
        return;
      }
    }

    if (destinationKey) {
      await deleteObjects({
        bucket: storageBuckets.originals,
        keys: [destinationKey],
      });
    }

    throw error;
  }
}

export async function processImportJob(
  importJobId: string,
  enqueuePhotoProcessing: QueuePhotoProcessing,
) {
  const importJob = await prisma.importJob.findUnique({
    where: { id: importJobId },
    select: {
      id: true,
      eventId: true,
      payloadJson: true,
      items: {
        where: {
          status: "PENDING",
        },
        orderBy: [{ createdAt: "asc" }],
        select: {
          id: true,
          importJobId: true,
          eventId: true,
          sourceKey: true,
          sourceFilename: true,
          sourceByteSize: true,
          cleanupMode: true,
          cleanupTargetKey: true,
          contentHashSha256: true,
        },
      },
    },
  });

  if (!importJob) {
    throw new Error(`Import job ${importJobId} not found`);
  }

  const payload = parseStorageImportPayload(importJob.payloadJson);

  if (!payload || !importJob.eventId) {
    throw new Error(`Import job ${importJobId} is missing payload or event`);
  }

  await prisma.importJob.update({
    where: { id: importJobId },
    data: {
      status: "RUNNING",
      startedAt: new Date(),
      finishedAt: null,
      errorMessage: null,
    },
  });

  logImport("info", "import.job.started", {
    importJobId,
    eventId: importJob.eventId,
    itemCount: importJob.items.length,
    trigger: payload.trigger,
  });

  await recordManyImportItemEvents(
    Object.fromEntries(
      importJob.items.map((item) => [
        item.id,
        [
          {
            eventType: "worker.started",
            label: "Import worker started",
            detail: item.sourceKey,
          },
        ],
      ]),
    ),
  );

  for (const item of importJob.items) {
    await prisma.importItem.update({
      where: { id: item.id },
      data: {
        status: "RUNNING",
        startedAt: new Date(),
        completedAt: null,
        errorMessage: null,
        cleanupError: null,
      },
    });

    const existingLink = await prisma.externalAssetLink.findUnique({
      where: {
        source_externalId_assetType: {
          source: "STORAGE_IMPORT",
          externalId: item.sourceKey,
          assetType: IMPORT_LINK_ASSET_TYPE,
        },
      },
      select: {
        id: true,
        externalId: true,
        eventId: true,
        metadataJson: true,
        photo: {
          select: {
            id: true,
            processingState: true,
            errorMessage: true,
            contentHashSha256: true,
          },
        },
      },
    });

    try {
      if (existingLink) {
        await processExistingImportLink({
          importItem: item,
          existingLink,
          enqueuePhotoProcessing,
        });
      } else {
        await createPhotoFromImportItem({
          importItem: item,
          payload,
          enqueuePhotoProcessing,
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to import object.";

      await markImportItemFailed({
        itemId: item.id,
        errorMessage: message,
        cleanupStatus: "NOT_REQUIRED",
        eventId: item.eventId,
        contentHashSha256: item.contentHashSha256,
      });

      await recordImportItemEvents(item.id, [
        {
          eventType: "item.failed",
          label: "Import failed before photo was ready",
          detail: message,
        },
      ]);

      logImport("error", "import.item.failed", {
        importItemId: item.id,
        importJobId,
        sourceKey: item.sourceKey,
        error: message,
      });
    }
  }

  await refreshImportJobProgress(importJobId);
}

export async function handleImportedPhotoReady(photoId: string) {
  const photo = await prisma.photo.findUnique({
    where: { id: photoId },
    select: {
      contentHashSha256: true,
    },
  });
  const items = await prisma.importItem.findMany({
    where: {
      photoId,
      status: {
        in: ["PENDING", "RUNNING"],
      },
    },
    select: {
      id: true,
      importJobId: true,
      eventId: true,
      sourceKey: true,
      cleanupMode: true,
      cleanupTargetKey: true,
    },
  });

  for (const item of items) {
    const link = await prisma.externalAssetLink.findUnique({
      where: {
        source_externalId_assetType: {
          source: "STORAGE_IMPORT",
          externalId: item.sourceKey,
          assetType: IMPORT_LINK_ASSET_TYPE,
        },
      },
      select: {
        id: true,
        externalId: true,
        metadataJson: true,
      },
    });

    if (!link) {
      await markImportItemFailed({
        itemId: item.id,
        photoId,
        eventId: item.eventId,
        errorMessage: "Imported photo is missing its storage import link.",
        contentHashSha256: photo?.contentHashSha256 ?? null,
      });
      await recordImportItemEvents(item.id, [
        {
          eventType: "item.failed",
          label: "Import link missing for completed photo",
        },
      ]);
      await refreshImportJobProgress(item.importJobId);
      continue;
    }

    try {
      await recordImportItemEvents(item.id, [
        {
          eventType: "processing.completed",
          label: "Derivative processing completed",
          metadataJson: {
            photoId,
            contentHashSha256: photo?.contentHashSha256 ?? null,
          } satisfies Prisma.InputJsonValue,
        },
      ]);

      const cleanup = await cleanupImportSourceLink({
        link,
        importItem: item,
      });

      await markImportItemComplete({
        itemId: item.id,
        photoId,
        eventId: item.eventId,
        cleanupStatus: cleanup.cleanupStatus,
        cleanupTargetKey: cleanup.cleanupTargetKey,
        contentHashSha256: photo?.contentHashSha256 ?? null,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Import cleanup failed.";

      await markImportItemFailed({
        itemId: item.id,
        photoId,
        eventId: item.eventId,
        errorMessage: message,
        cleanupStatus: "FAILED",
        cleanupError: message,
        contentHashSha256: photo?.contentHashSha256 ?? null,
      });
    }

    await refreshImportJobProgress(item.importJobId);
  }
}

export async function handleImportedPhotoFailed(photoId: string, reason: string) {
  const photo = await prisma.photo.findUnique({
    where: { id: photoId },
    select: {
      contentHashSha256: true,
    },
  });
  const items = await prisma.importItem.findMany({
    where: {
      photoId,
      status: {
        in: ["PENDING", "RUNNING"],
      },
    },
    select: {
      id: true,
      importJobId: true,
      eventId: true,
      sourceKey: true,
    },
  });

  for (const item of items) {
    await markImportItemFailed({
      itemId: item.id,
      photoId,
      eventId: item.eventId,
      errorMessage: reason,
      cleanupStatus: "NOT_REQUIRED",
      contentHashSha256: photo?.contentHashSha256 ?? null,
    });

    await recordImportItemEvents(item.id, [
      {
        eventType: "processing.failed",
        label: "Photo processing failed",
        detail: reason,
        metadataJson: {
          photoId,
          contentHashSha256: photo?.contentHashSha256 ?? null,
        } satisfies Prisma.InputJsonValue,
      },
    ]);

    logImport("warn", "import.item.photo-failed", {
      importItemId: item.id,
      importJobId: item.importJobId,
      sourceKey: item.sourceKey,
      photoId,
      error: reason,
    });

    await refreshImportJobProgress(item.importJobId);
  }
}
