import "server-only";

import { Prisma, type ImportItemStatus } from "../../../prisma/generated/client/client";

import { env } from "@/lib/env";
import {
  recordImportJobEvents,
  type ImportTimelineEventInput,
} from "@/lib/import-timeline";
import { prisma } from "@/lib/prisma";
import { enqueueImportProcessing } from "@/lib/queue";
import { listObjects, storageBuckets } from "@/lib/storage";
import type {
  StorageWebhookAdapterId,
  StorageWebhookRecord,
} from "@/lib/storage-webhook-adapters";

export const IMPORT_LINK_ASSET_TYPE = "IMPORT_OBJECT";

export type ImportCleanupMode = "delete" | "archive";
export type ImportTrigger = "scan" | "webhook";
export type ImportAdminVisibility = "ACTIVE" | "ALL";
export type ImportBulkAction =
  | "retry-failed"
  | "retry-cleanup-failed"
  | "dismiss-terminal";

export type StorageImportPayload = {
  kind: "storage-import";
  version: 3;
  trigger: ImportTrigger;
  adapterId: StorageWebhookAdapterId | null;
  eventSlug: string;
  sourcePrefix: string;
  cleanupMode: ImportCleanupMode;
  archivePrefix: string | null;
  files: Array<{
    sourceKey: string;
    filename: string;
    size: number;
    lastModified: string | null;
    bucket: string | null;
    eventName: string | null;
    deliveryId: string | null;
    sourceProvider: string | null;
    sourceEtag: string | null;
    sourceVersion: string | null;
  }>;
};

type ImportCandidate = {
  trigger: ImportTrigger;
  adapterId: StorageWebhookAdapterId | null;
  sourceKey: string;
  sourceFilename: string;
  sourceByteSize: number;
  sourceLastModified: Date | null;
  eventSlug: string;
  bucket: string | null;
  eventName: string | null;
  deliveryId: string | null;
  sourceProvider: string | null;
  sourceEtag: string | null;
  sourceVersion: string | null;
};

type ImportCandidateDecision =
  | {
      mode: "queue";
    }
  | {
      mode: "skip";
      skipReason: string;
      status: "SKIPPED";
      photoId: string | null;
      eventId: string | null;
      contentHashSha256: string | null;
      cleanupStatus: "NOT_REQUIRED";
      cleanupTargetKey: string | null;
    };

type ImportQueueCandidate = ImportCandidate & {
  decision: ImportCandidateDecision;
};

type ScanSummary = {
  groupsDiscovered: number;
  itemsDiscovered: number;
  jobsCreated: number;
  itemsCreated: number;
  itemsQueued: number;
  itemsSkipped: number;
  eventsCreated: number;
};

type ExistingImportState = {
  latestItemByKey: Map<
    string,
    {
      id: string;
      sourceKey: string;
      importJobId: string;
      status: ImportItemStatus;
      eventId: string | null;
      photoId: string | null;
      skipReason: string | null;
      errorMessage: string | null;
      cleanupStatus: string;
      cleanupTargetKey: string | null;
      contentHashSha256: string | null;
    }
  >;
  activeItemByKey: Map<
    string,
    {
      id: string;
      sourceKey: string;
      importJobId: string;
      status: ImportItemStatus;
      eventId: string | null;
      photoId: string | null;
      contentHashSha256: string | null;
    }
  >;
  importLinkByKey: Map<
    string,
    {
      id: string;
      externalId: string;
      eventId: string | null;
      photoId: string | null;
      photoProcessingState: string | null;
      contentHashSha256: string | null;
    }
  >;
};

type ImportFilterStatus = "ALL" | ImportItemStatus;

export function normalizeImportAdminFilters(filters?: {
  status?: string | null;
  query?: string | null;
  visibility?: string | null;
}) {
  const allowedStatuses = new Set<ImportFilterStatus>([
    "ALL",
    "PENDING",
    "RUNNING",
    "COMPLETE",
    "FAILED",
    "SKIPPED",
  ]);

  const status = allowedStatuses.has((filters?.status ?? "ALL") as ImportFilterStatus)
    ? ((filters?.status ?? "ALL") as ImportFilterStatus)
    : "ALL";
  const query = filters?.query?.trim() ?? "";
  const visibility: ImportAdminVisibility =
    filters?.visibility === "ALL" ? "ALL" : "ACTIVE";

  return {
    status,
    query,
    visibility,
  };
}

export function buildImportItemWhere(filters?: {
  status?: string | null;
  query?: string | null;
  visibility?: string | null;
}) {
  const normalized = normalizeImportAdminFilters(filters);
  const where: Prisma.ImportItemWhereInput = {
    source: "STORAGE_IMPORT",
    ...(normalized.status !== "ALL" ? { status: normalized.status } : {}),
    ...(normalized.visibility === "ACTIVE" ? { dismissedAt: null } : {}),
  };

  if (normalized.query) {
    where.OR = [
      {
        sourceKey: {
          contains: normalized.query,
          mode: "insensitive",
        },
      },
      {
        sourceFilename: {
          contains: normalized.query,
          mode: "insensitive",
        },
      },
      {
        eventSlug: {
          contains: normalized.query,
          mode: "insensitive",
        },
      },
    ];
  }

  return where;
}

function logImport(
  level: "info" | "warn" | "error",
  event: string,
  data: Record<string, unknown>,
) {
  const message = JSON.stringify({
    scope: "imports.app",
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

function normalizePrefix(prefix: string) {
  return prefix.endsWith("/") ? prefix : `${prefix}/`;
}

function titleFromSlug(slug: string) {
  return (
    slug
      .split(/[-_]+/g)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
      .trim() || "Imported Event"
  );
}

function serializeDate(value: Date | null) {
  return value ? value.toISOString() : null;
}

function parseImportObjectKey(sourceKey: string) {
  const importsPrefix = normalizePrefix(env.IMPORTS_PREFIX);

  if (!sourceKey.startsWith(importsPrefix)) {
    return null;
  }

  const relativePath = sourceKey.slice(importsPrefix.length);
  const segments = relativePath.split("/").filter(Boolean);

  if (segments.length < 2) {
    return null;
  }

  const [eventSlug] = segments;
  const filename = segments.at(-1) ?? null;

  if (!eventSlug || !filename) {
    return null;
  }

  return {
    eventSlug,
    filename,
  };
}

export function buildImportArchiveKey(sourceKey: string) {
  const importsPrefix = normalizePrefix(env.IMPORTS_PREFIX);
  const archivePrefix = normalizePrefix(env.IMPORTS_ARCHIVE_PREFIX);

  if (!sourceKey.startsWith(importsPrefix)) {
    return `${archivePrefix}${sourceKey}`;
  }

  return `${archivePrefix}${sourceKey.slice(importsPrefix.length)}`;
}

export function parseStorageImportPayload(payload: unknown): StorageImportPayload | null {
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
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }

      const file = entry as Record<string, unknown>;

      if (
        typeof file.sourceKey !== "string" ||
        typeof file.filename !== "string" ||
        typeof file.size !== "number"
      ) {
        return null;
      }

      return {
        sourceKey: file.sourceKey,
        filename: file.filename,
        size: file.size,
        lastModified: typeof file.lastModified === "string" ? file.lastModified : null,
        bucket: typeof file.bucket === "string" ? file.bucket : null,
        eventName: typeof file.eventName === "string" ? file.eventName : null,
        deliveryId: typeof file.deliveryId === "string" ? file.deliveryId : null,
        sourceProvider:
          typeof file.sourceProvider === "string" ? file.sourceProvider : null,
        sourceEtag: typeof file.sourceEtag === "string" ? file.sourceEtag : null,
        sourceVersion:
          typeof file.sourceVersion === "string" ? file.sourceVersion : null,
      };
    })
    .filter(Boolean) as StorageImportPayload["files"];

  return {
    kind: "storage-import",
    version: 3,
    trigger: candidate.trigger === "webhook" ? "webhook" : "scan",
    adapterId:
      typeof candidate.adapterId === "string"
        ? (candidate.adapterId as StorageWebhookAdapterId)
        : null,
    eventSlug: candidate.eventSlug,
    sourcePrefix: candidate.sourcePrefix,
    cleanupMode: candidate.cleanupMode,
    archivePrefix:
      typeof candidate.archivePrefix === "string" ? candidate.archivePrefix : null,
    files,
  };
}

async function findOrCreateImportEvent(eventSlug: string) {
  const existing = await prisma.event.findUnique({
    where: {
      slug: eventSlug,
    },
    select: {
      id: true,
      slug: true,
      title: true,
    },
  });

  if (existing) {
    return {
      event: existing,
      created: false,
    };
  }

  try {
    const created = await prisma.event.create({
      data: {
        slug: eventSlug,
        title: titleFromSlug(eventSlug),
        eventDate: new Date(),
        visibility: "DRAFT",
      },
      select: {
        id: true,
        slug: true,
        title: true,
      },
    });

    return {
      event: created,
      created: true,
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const raceWinner = await prisma.event.findUnique({
        where: {
          slug: eventSlug,
        },
        select: {
          id: true,
          slug: true,
          title: true,
        },
      });

      if (raceWinner) {
        return {
          event: raceWinner,
          created: false,
        };
      }
    }

    throw error;
  }
}

async function loadExistingImportState(sourceKeys: string[]): Promise<ExistingImportState> {
  if (!sourceKeys.length) {
    return {
      latestItemByKey: new Map(),
      activeItemByKey: new Map(),
      importLinkByKey: new Map(),
    };
  }

  const [links, items] = await Promise.all([
    prisma.externalAssetLink.findMany({
      where: {
        source: "STORAGE_IMPORT",
        assetType: IMPORT_LINK_ASSET_TYPE,
        externalId: {
          in: sourceKeys,
        },
      },
      select: {
        id: true,
        externalId: true,
        eventId: true,
        photoId: true,
        photo: {
          select: {
            id: true,
            processingState: true,
            contentHashSha256: true,
          },
        },
      },
    }),
    prisma.importItem.findMany({
      where: {
        source: "STORAGE_IMPORT",
        sourceKey: {
          in: sourceKeys,
        },
      },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        sourceKey: true,
        importJobId: true,
        status: true,
        eventId: true,
        photoId: true,
        skipReason: true,
        errorMessage: true,
        cleanupStatus: true,
        cleanupTargetKey: true,
        contentHashSha256: true,
      },
    }),
  ]);

  const latestItemByKey = new Map<string, ExistingImportState["latestItemByKey"] extends Map<string, infer T> ? T : never>();
  const activeItemByKey = new Map<string, ExistingImportState["activeItemByKey"] extends Map<string, infer T> ? T : never>();
  const importLinkByKey = new Map<string, ExistingImportState["importLinkByKey"] extends Map<string, infer T> ? T : never>();

  for (const item of items) {
    if (!latestItemByKey.has(item.sourceKey)) {
      latestItemByKey.set(item.sourceKey, {
        id: item.id,
        sourceKey: item.sourceKey,
        importJobId: item.importJobId,
        status: item.status,
        eventId: item.eventId,
        photoId: item.photoId,
        skipReason: item.skipReason,
        errorMessage: item.errorMessage,
        cleanupStatus: item.cleanupStatus,
        cleanupTargetKey: item.cleanupTargetKey,
        contentHashSha256: item.contentHashSha256,
      });
    }

    if (
      (item.status === "PENDING" || item.status === "RUNNING") &&
      !activeItemByKey.has(item.sourceKey)
    ) {
      activeItemByKey.set(item.sourceKey, {
        id: item.id,
        sourceKey: item.sourceKey,
        importJobId: item.importJobId,
        status: item.status,
        eventId: item.eventId,
        photoId: item.photoId,
        contentHashSha256: item.contentHashSha256,
      });
    }
  }

  for (const link of links) {
    importLinkByKey.set(link.externalId, {
      id: link.id,
      externalId: link.externalId,
      eventId: link.eventId,
      photoId: link.photoId,
      photoProcessingState: link.photo?.processingState ?? null,
      contentHashSha256: link.photo?.contentHashSha256 ?? null,
    });
  }

  return {
    latestItemByKey,
    activeItemByKey,
    importLinkByKey,
  };
}

function decideImportCandidate(
  candidate: ImportCandidate,
  existingState: ExistingImportState,
): ImportCandidateDecision {
  const existingLink = existingState.importLinkByKey.get(candidate.sourceKey);

  if (existingLink) {
    const linkedPhoto = existingLink.photoId
      ? `photo ${existingLink.photoId}`
      : "an imported photo";

    return {
      mode: "skip",
      status: "SKIPPED",
      skipReason: `Duplicate object key already linked to ${linkedPhoto}.`,
      photoId: existingLink.photoId,
      eventId: existingLink.eventId,
      contentHashSha256: existingLink.contentHashSha256,
      cleanupStatus: "NOT_REQUIRED",
      cleanupTargetKey: null,
    };
  }

  const activeItem = existingState.activeItemByKey.get(candidate.sourceKey);

  if (activeItem) {
    return {
      mode: "skip",
      status: "SKIPPED",
      skipReason: `Duplicate delivery already queued in import job ${activeItem.importJobId.slice(0, 8)}.`,
      photoId: activeItem.photoId,
      eventId: activeItem.eventId,
      contentHashSha256: activeItem.contentHashSha256,
      cleanupStatus: "NOT_REQUIRED",
      cleanupTargetKey: null,
    };
  }

  const latestItem = existingState.latestItemByKey.get(candidate.sourceKey);

  if (latestItem?.status === "FAILED") {
    return {
      mode: "skip",
      status: "SKIPPED",
      skipReason: `A failed import item already exists for this object. Retry item ${latestItem.id.slice(0, 8)} instead of ingesting it again.`,
      photoId: latestItem.photoId,
      eventId: latestItem.eventId,
      contentHashSha256: latestItem.contentHashSha256,
      cleanupStatus: "NOT_REQUIRED",
      cleanupTargetKey: latestItem.cleanupTargetKey,
    };
  }

  if (latestItem?.status === "COMPLETE" || latestItem?.status === "SKIPPED") {
    return {
      mode: "skip",
      status: "SKIPPED",
      skipReason:
        latestItem.skipReason ??
        `Object key ${candidate.sourceKey} was already recorded by an earlier import.`,
      photoId: latestItem.photoId,
      eventId: latestItem.eventId,
      contentHashSha256: latestItem.contentHashSha256,
      cleanupStatus: "NOT_REQUIRED",
      cleanupTargetKey: latestItem.cleanupTargetKey,
    };
  }

  return {
    mode: "queue",
  };
}

function buildStorageImportPayload(args: {
  trigger: ImportTrigger;
  adapterId: StorageWebhookAdapterId | null;
  eventSlug: string;
  files: ImportCandidate[];
}) {
  const cleanupMode = env.IMPORTS_CLEANUP_MODE;

  return {
    kind: "storage-import",
    version: 3,
    trigger: args.trigger,
    adapterId: args.adapterId,
    eventSlug: args.eventSlug,
    sourcePrefix: normalizePrefix(env.IMPORTS_PREFIX),
    cleanupMode,
    archivePrefix:
      cleanupMode === "archive" ? normalizePrefix(env.IMPORTS_ARCHIVE_PREFIX) : null,
    files: args.files.map((file) => ({
      sourceKey: file.sourceKey,
      filename: file.sourceFilename,
      size: file.sourceByteSize,
      lastModified: serializeDate(file.sourceLastModified),
      bucket: file.bucket,
      eventName: file.eventName,
      deliveryId: file.deliveryId,
      sourceProvider: file.sourceProvider,
      sourceEtag: file.sourceEtag,
      sourceVersion: file.sourceVersion,
    })),
  } satisfies StorageImportPayload;
}

function buildCreationEvents(args: {
  candidate: ImportQueueCandidate;
  eventId: string;
  eventWasCreated: boolean;
  queued: boolean;
}) {
  const discoveryEventType =
    args.candidate.trigger === "webhook" ? "webhook.received" : "scan.discovered";
  const discoveryLabel =
    args.candidate.trigger === "webhook"
      ? "Webhook received"
      : "Found during manual scan";
  const events: ImportTimelineEventInput[] = [
    {
      eventType: discoveryEventType,
      label: discoveryLabel,
      detail: args.candidate.sourceKey,
      metadataJson: {
        adapterId: args.candidate.adapterId,
        provider: args.candidate.sourceProvider,
        bucket: args.candidate.bucket,
        eventName: args.candidate.eventName,
        deliveryId: args.candidate.deliveryId,
        sourceEtag: args.candidate.sourceEtag,
        sourceVersion: args.candidate.sourceVersion,
      } satisfies Prisma.InputJsonValue,
    },
    {
      eventType: "item.created",
      label: "Import item recorded",
      detail: args.candidate.sourceFilename,
    },
    {
      eventType: args.eventWasCreated ? "event.created" : "event.resolved",
      label: args.eventWasCreated ? "Draft event created" : "Existing event resolved",
      detail: args.candidate.eventSlug,
      metadataJson: {
        eventId: args.eventId,
      } satisfies Prisma.InputJsonValue,
    },
  ];

  if (args.queued) {
    events.push({
      eventType: "processing.queued",
      label: "Queued for import processing",
      metadataJson: {
        cleanupMode: env.IMPORTS_CLEANUP_MODE,
      } satisfies Prisma.InputJsonValue,
    });
  } else if (args.candidate.decision.mode === "skip") {
    events.push({
      eventType: "item.skipped",
      label: "Skipped as duplicate",
      detail: args.candidate.decision.skipReason,
      metadataJson: {
        photoId: args.candidate.decision.photoId,
        eventId: args.candidate.decision.eventId,
        contentHashSha256: args.candidate.decision.contentHashSha256,
      } satisfies Prisma.InputJsonValue,
    });
  }

  return events;
}

async function queueStorageImportCandidates(args: {
  trigger: ImportTrigger;
  adapterId: StorageWebhookAdapterId | null;
  requestedById?: string | null;
  candidates: ImportCandidate[];
}) {
  if (!args.candidates.length) {
    return {
      groupsDiscovered: 0,
      itemsDiscovered: 0,
      jobsCreated: 0,
      itemsCreated: 0,
      itemsQueued: 0,
      itemsSkipped: 0,
      eventsCreated: 0,
    } satisfies ScanSummary;
  }

  const groupedBySlug = new Map<string, ImportCandidate[]>();

  for (const candidate of args.candidates) {
    const current = groupedBySlug.get(candidate.eventSlug) ?? [];
    current.push(candidate);
    groupedBySlug.set(candidate.eventSlug, current);
  }

  const summary: ScanSummary = {
    groupsDiscovered: groupedBySlug.size,
    itemsDiscovered: args.candidates.length,
    jobsCreated: 0,
    itemsCreated: 0,
    itemsQueued: 0,
    itemsSkipped: 0,
    eventsCreated: 0,
  };

  for (const [eventSlug, group] of groupedBySlug) {
    const existingState = await loadExistingImportState(group.map((item) => item.sourceKey));
    const { event, created } = await findOrCreateImportEvent(eventSlug);

    if (created) {
      summary.eventsCreated += 1;
    }

    const queueCandidates = group.map((candidate) => ({
      ...candidate,
      decision: decideImportCandidate(candidate, existingState),
    }));
    const pendingCandidates = queueCandidates.filter(
      (candidate) => candidate.decision.mode === "queue",
    );
    const skippedCandidates = queueCandidates.filter(
      (candidate) => candidate.decision.mode === "skip",
    );
    const payload = buildStorageImportPayload({
      trigger: args.trigger,
      adapterId: args.adapterId,
      eventSlug,
      files: group,
    });

    const importJob = await prisma.$transaction(async (tx) => {
      const createdJob = await tx.importJob.create({
        data: {
          type: "STORAGE_IMPORT",
          source: "STORAGE_IMPORT",
          status: pendingCandidates.length > 0 ? "PENDING" : "SUCCEEDED",
          eventId: event.id,
          requestedById: args.requestedById ?? null,
          payloadJson: payload as Prisma.InputJsonValue,
          totalItems: queueCandidates.length,
          processedItems: skippedCandidates.length,
          startedAt: pendingCandidates.length > 0 ? null : new Date(),
          finishedAt: pendingCandidates.length > 0 ? null : new Date(),
        },
        select: {
          id: true,
        },
      });

      await tx.importItem.createMany({
        data: queueCandidates.map((candidate) => ({
          importJobId: createdJob.id,
          source: "STORAGE_IMPORT",
          sourceKey: candidate.sourceKey,
          sourceFilename: candidate.sourceFilename,
          sourceByteSize: BigInt(candidate.sourceByteSize),
          sourceLastModified: candidate.sourceLastModified,
          sourceProvider: candidate.sourceProvider,
          sourceEtag: candidate.sourceEtag,
          sourceVersion: candidate.sourceVersion,
          eventSlug: candidate.eventSlug,
          eventId:
            candidate.decision.mode === "skip"
              ? candidate.decision.eventId ?? event.id
              : event.id,
          photoId:
            candidate.decision.mode === "skip"
              ? candidate.decision.photoId
              : null,
          status: candidate.decision.mode === "skip" ? "SKIPPED" : "PENDING",
          cleanupMode: env.IMPORTS_CLEANUP_MODE,
          cleanupStatus:
            candidate.decision.mode === "skip"
              ? candidate.decision.cleanupStatus
              : "PENDING",
          cleanupTargetKey:
            candidate.decision.mode === "skip"
              ? candidate.decision.cleanupTargetKey
              : env.IMPORTS_CLEANUP_MODE === "archive"
                ? buildImportArchiveKey(candidate.sourceKey)
                : null,
          skipReason:
            candidate.decision.mode === "skip"
              ? candidate.decision.skipReason
              : null,
          errorMessage: null,
          startedAt: null,
          completedAt: candidate.decision.mode === "skip" ? new Date() : null,
          contentHashSha256:
            candidate.decision.mode === "skip"
              ? candidate.decision.contentHashSha256
              : null,
        })),
      });

      const createdItems = await tx.importItem.findMany({
        where: {
          importJobId: createdJob.id,
        },
        select: {
          id: true,
          sourceKey: true,
        },
      });

      const itemIdByKey = new Map(createdItems.map((item) => [item.sourceKey, item.id]));
      const timelineEntries = queueCandidates.flatMap((candidate) => {
        const itemId = itemIdByKey.get(candidate.sourceKey);

        if (!itemId) {
          return [];
        }

        return buildCreationEvents({
          candidate,
          eventId: event.id,
          eventWasCreated: created,
          queued: candidate.decision.mode === "queue",
        }).map((timelineEvent) => ({
          importItemId: itemId,
          eventType: timelineEvent.eventType,
          label: timelineEvent.label,
          detail: timelineEvent.detail ?? null,
          metadataJson: timelineEvent.metadataJson ?? undefined,
          createdAt: timelineEvent.createdAt ?? new Date(),
        }));
      });

      if (timelineEntries.length) {
        await tx.importItemEvent.createMany({
          data: timelineEntries,
        });
      }

      return createdJob;
    });

    if (pendingCandidates.length > 0) {
      await enqueueImportProcessing(importJob.id);
    }

    summary.jobsCreated += 1;
    summary.itemsCreated += queueCandidates.length;
    summary.itemsQueued += pendingCandidates.length;
    summary.itemsSkipped += skippedCandidates.length;

    logImport("info", "imports.job.created", {
      importJobId: importJob.id,
      trigger: args.trigger,
      adapterId: args.adapterId,
      eventSlug,
      eventId: event.id,
      itemsCreated: queueCandidates.length,
      itemsQueued: pendingCandidates.length,
      itemsSkipped: skippedCandidates.length,
    });
  }

  return summary;
}

export async function scanAndEnqueueStorageImports(requestedById?: string | null) {
  const importObjects = await listObjects({
    bucket: storageBuckets.originals,
    prefix: normalizePrefix(env.IMPORTS_PREFIX),
  });

  const candidates = importObjects
    .map((object) => {
      const parsed = parseImportObjectKey(object.key);

      if (!parsed) {
        return null;
      }

      return {
        trigger: "scan",
        adapterId: null,
        sourceKey: object.key,
        sourceFilename: parsed.filename,
        sourceByteSize: object.size,
        sourceLastModified: object.lastModified,
        eventSlug: parsed.eventSlug,
        bucket: storageBuckets.originals,
        eventName: null,
        deliveryId: null,
        sourceProvider: "manual-scan",
        sourceEtag: null,
        sourceVersion: null,
      } satisfies ImportCandidate;
    })
    .filter(Boolean) as ImportCandidate[];

  logImport("info", "imports.scan.discovered", {
    objectCount: importObjects.length,
    candidateCount: candidates.length,
    prefix: normalizePrefix(env.IMPORTS_PREFIX),
  });

  return queueStorageImportCandidates({
    trigger: "scan",
    adapterId: null,
    requestedById,
    candidates,
  });
}

export async function enqueueWebhookStorageImports(args: {
  records: StorageWebhookRecord[];
  adapterId?: StorageWebhookAdapterId | null;
}) {
  const candidates = args.records
    .map((record) => {
      const parsed = parseImportObjectKey(record.sourceKey);

      if (!parsed) {
        return null;
      }

      return {
        trigger: "webhook",
        adapterId: args.adapterId ?? record.adapterId,
        sourceKey: record.sourceKey,
        sourceFilename: parsed.filename,
        sourceByteSize: record.size,
        sourceLastModified: record.lastModified,
        eventSlug: parsed.eventSlug,
        bucket: record.bucket,
        eventName: record.eventName,
        deliveryId: record.deliveryId,
        sourceProvider: record.sourceProvider,
        sourceEtag: record.sourceEtag,
        sourceVersion: record.sourceVersion,
      } satisfies ImportCandidate;
    })
    .filter(Boolean) as ImportCandidate[];

  logImport("info", "imports.webhook.discovered", {
    recordCount: args.records.length,
    candidateCount: candidates.length,
    adapterId: args.adapterId ?? null,
  });

  return queueStorageImportCandidates({
    trigger: "webhook",
    adapterId: args.adapterId ?? candidates[0]?.adapterId ?? null,
    candidates,
  });
}

async function resetImportItemsForRetry(items: Array<{
  id: string;
  importJobId: string;
  sourceKey: string;
  cleanupTargetKey: string | null;
}>) {
  if (!items.length) {
    return {
      itemsRetried: 0,
      jobsQueued: 0,
    };
  }

  const now = new Date();
  const itemIds = items.map((item) => item.id);
  const jobIds = [...new Set(items.map((item) => item.importJobId))];

  await prisma.importItem.updateMany({
    where: {
      id: {
        in: itemIds,
      },
    },
    data: {
      status: "PENDING",
      skipReason: null,
      errorMessage: null,
      cleanupStatus: "PENDING",
      cleanupError: null,
      startedAt: null,
      completedAt: null,
      dismissedAt: null,
    },
  });

  await prisma.importJob.updateMany({
    where: {
      id: {
        in: jobIds,
      },
    },
    data: {
      status: "PENDING",
      errorMessage: null,
      finishedAt: null,
    },
  });

  const eventsByJob = items.reduce<Record<string, Record<string, ImportTimelineEventInput[]>>>(
    (summary, item) => {
      summary[item.importJobId] ??= {};
      summary[item.importJobId]![item.id] = [
        {
          eventType: "retry.queued",
          label: "Retry queued",
          detail: item.sourceKey,
          metadataJson: {
            cleanupTargetKey: item.cleanupTargetKey,
          } satisfies Prisma.InputJsonValue,
          createdAt: now,
        },
      ];
      return summary;
    },
    {},
  );

  for (const [importJobId, eventsByItemId] of Object.entries(eventsByJob)) {
    await recordImportJobEvents(importJobId, eventsByItemId);
  }

  await Promise.all(jobIds.map((importJobId) => enqueueImportProcessing(importJobId)));

  logImport("info", "imports.retry.queued", {
    itemCount: items.length,
    jobCount: jobIds.length,
    itemIds,
    jobIds,
  });

  return {
    itemsRetried: items.length,
    jobsQueued: jobIds.length,
  };
}

export async function retryStorageImportItem(importItemId: string) {
  const item = await prisma.importItem.findUnique({
    where: {
      id: importItemId,
    },
    select: {
      id: true,
      importJobId: true,
      sourceKey: true,
      status: true,
      cleanupTargetKey: true,
    },
  });

  if (!item || item.status !== "FAILED") {
    throw new Error("Only failed import items can be retried.");
  }

  return resetImportItemsForRetry([item]);
}

export async function retryStorageImportJob(importJobId: string) {
  const items = await prisma.importItem.findMany({
    where: {
      importJobId,
      status: "FAILED",
    },
    select: {
      id: true,
      importJobId: true,
      sourceKey: true,
      cleanupTargetKey: true,
    },
  });

  if (!items.length) {
    throw new Error("This import job has no failed items to retry.");
  }

  return resetImportItemsForRetry(items);
}

export async function applyImportBulkAction(args: {
  action: ImportBulkAction;
  filters?: {
    status?: string | null;
    query?: string | null;
    visibility?: string | null;
  };
}) {
  const baseWhere = buildImportItemWhere(args.filters);

  if (args.action === "dismiss-terminal") {
    const items = await prisma.importItem.findMany({
      where: {
        ...baseWhere,
        status: {
          in: ["COMPLETE", "SKIPPED"],
        },
        dismissedAt: null,
      },
      select: {
        id: true,
        importJobId: true,
      },
    });

    if (!items.length) {
      return {
        action: args.action,
        eligibleCount: 0,
        updatedCount: 0,
      };
    }

    const dismissedAt = new Date();

    await prisma.importItem.updateMany({
      where: {
        id: {
          in: items.map((item) => item.id),
        },
      },
      data: {
        dismissedAt,
      },
    });

    const byJob = items.reduce<Record<string, Record<string, ImportTimelineEventInput[]>>>(
      (summary, item) => {
        summary[item.importJobId] ??= {};
        summary[item.importJobId]![item.id] = [
          {
            eventType: "queue.dismissed",
            label: "Dismissed from active queue",
            createdAt: dismissedAt,
          },
        ];
        return summary;
      },
      {},
    );

    for (const [jobId, eventsByItemId] of Object.entries(byJob)) {
      await recordImportJobEvents(jobId, eventsByItemId);
    }

    logImport("info", "imports.bulk.dismissed", {
      eligibleCount: items.length,
      filters: normalizeImportAdminFilters(args.filters),
    });

    return {
      action: args.action,
      eligibleCount: items.length,
      updatedCount: items.length,
    };
  }

  const items = await prisma.importItem.findMany({
    where: {
      ...baseWhere,
      status: "FAILED",
      ...(args.action === "retry-cleanup-failed"
        ? { cleanupStatus: "FAILED" }
        : {}),
    },
    select: {
      id: true,
      importJobId: true,
      sourceKey: true,
      cleanupTargetKey: true,
    },
  });

  if (!items.length) {
    return {
      action: args.action,
      eligibleCount: 0,
      updatedCount: 0,
      jobsQueued: 0,
    };
  }

  const result = await resetImportItemsForRetry(items);

  return {
    action: args.action,
    eligibleCount: items.length,
    updatedCount: result.itemsRetried,
    jobsQueued: result.jobsQueued,
  };
}
