import "server-only";

import { z } from "zod";

import { getResolvedRuntimeSettings } from "@/lib/app-settings";
import { generatePhotoId } from "@/lib/ids";
import { syncEventPhotoOrder } from "@/lib/admin-photo-operations";
import { inferPhotoMimeType } from "@/lib/photo-files";
import { enqueuePhotoProcessing } from "@/lib/queue";
import { prisma } from "@/lib/prisma";
import {
  extensionFromFilename,
  getStorageBuckets,
  headObject,
  presignUploadObject,
} from "@/lib/storage";
import { slugify } from "@/lib/strings";

type EventVisibilityValue = "DRAFT" | "HIDDEN" | "PUBLIC";
type DirectUploadMode = "create" | "existing";

type PrepareUploadFile = {
  clientId: string;
  name: string;
  size: number;
  type: string;
  lastModified: number | null;
};

type FailedUpload = {
  clientId: string;
  error: string;
};

const manualUploadPayloadSchema = z.object({
  version: z.literal(1),
  transport: z.literal("presigned-put"),
  eventId: z.string().min(1),
  eventSlug: z.string().min(1),
  files: z.array(
    z.object({
      clientId: z.string().min(1),
      photoId: z.string().min(1),
      originalKey: z.string().min(1),
      originalFilename: z.string().min(1),
      originalMimeType: z.string().min(1),
      originalByteSize: z.number().int().nonnegative(),
      sourceLastModified: z.number().int().nonnegative().nullable(),
    }),
  ),
});

function normalizeText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function dedupeUploadFiles(files: PrepareUploadFile[]) {
  const seen = new Set<string>();

  return files.filter((file) => {
    const key = `${file.clientId}:${file.name}:${file.size}:${file.lastModified ?? 0}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

async function slugIsTaken(slug: string) {
  const existing = await prisma.event.findUnique({
    where: { slug },
    select: { id: true },
  });

  return Boolean(existing);
}

async function resolveUploadEvent(args:
  | {
      mode: "existing";
      eventId: string;
    }
  | {
      mode: "create";
      title: string;
      slug: string;
      location: string;
      description: string;
      visibility: EventVisibilityValue;
    }) {
  if (args.mode === "existing") {
    const event = await prisma.event.findUnique({
      where: { id: args.eventId },
      select: {
        id: true,
        slug: true,
      },
    });

    if (!event) {
      throw new Error("Event not found.");
    }

    return event;
  }

  const title = normalizeText(args.title);
  const slug = slugify(normalizeText(args.slug) || title);

  if (!title || !slug) {
    throw new Error("New events require a title and slug.");
  }

  if (await slugIsTaken(slug)) {
    throw new Error("That slug is already in use.");
  }

  return prisma.event.create({
    data: {
      title,
      slug,
      eventDate: new Date(),
      eventEndDate: null,
      location: normalizeText(args.location) || null,
      description: normalizeText(args.description) || null,
      visibility: args.visibility,
      publishedAt: args.visibility === "PUBLIC" ? new Date() : null,
    },
    select: {
      id: true,
      slug: true,
    },
  });
}

function parseManualUploadPayload(payloadJson: unknown) {
  const parsed = manualUploadPayloadSchema.safeParse(payloadJson);
  return parsed.success ? parsed.data : null;
}

function summarizeFailedUploads(failedUploads: FailedUpload[]) {
  if (!failedUploads.length) {
    return null;
  }

  const sample = failedUploads
    .slice(0, 3)
    .map((upload) => upload.error.trim())
    .filter(Boolean);

  return sample.length
    ? `Some uploads failed before registration: ${sample.join("; ")}`
    : `${failedUploads.length} uploads failed before registration.`;
}

export async function prepareDirectUploadSession(args: {
  adminId: string;
  mode: DirectUploadMode;
  eventId?: string;
  title?: string;
  slug?: string;
  location?: string;
  description?: string;
  visibility?: EventVisibilityValue;
  files: PrepareUploadFile[];
}) {
  const runtimeSettings = await getResolvedRuntimeSettings();

  if (!runtimeSettings.directUploadEnabled) {
    throw new Error("Direct uploads are disabled in settings.");
  }

  const files = dedupeUploadFiles(args.files).filter((file) => file.size > 0);

  if (!files.length) {
    throw new Error("Add at least one photo before uploading.");
  }

  const event =
    args.mode === "existing"
      ? await resolveUploadEvent({
          mode: "existing",
          eventId: normalizeText(args.eventId),
        })
      : await resolveUploadEvent({
          mode: "create",
          title: normalizeText(args.title),
          slug: normalizeText(args.slug),
          location: normalizeText(args.location),
          description: normalizeText(args.description),
          visibility: args.visibility ?? runtimeSettings.defaultEventVisibility,
        });
  const buckets = await getStorageBuckets();

  const importJob = await prisma.importJob.create({
    data: {
      type: "MANUAL_UPLOAD",
      source: "MANUAL",
      status: "RUNNING",
      requestedById: args.adminId,
      eventId: event.id,
      totalItems: files.length,
      startedAt: new Date(),
    },
  });

  try {
    const preparedFiles = await Promise.all(
      files.map(async (file) => {
        const photoId = generatePhotoId();
        const originalMimeType = inferPhotoMimeType(file.name, file.type);
        const originalKey = `events/${event.id}/photos/${photoId}/original.${extensionFromFilename(file.name)}`;
        const upload = await presignUploadObject({
          bucket: buckets.originals,
          key: originalKey,
          contentType: originalMimeType,
        });

        return {
          clientId: file.clientId,
          photoId,
          originalKey,
          originalFilename: file.name,
          originalMimeType,
          originalByteSize: file.size,
          sourceLastModified: file.lastModified,
          upload,
        };
      }),
    );

    await prisma.importJob.update({
      where: { id: importJob.id },
      data: {
        payloadJson: {
          version: 1,
          transport: "presigned-put",
          eventId: event.id,
          eventSlug: event.slug,
          files: preparedFiles.map((file) => {
            const { upload, ...manifestFile } = file;
            void upload;
            return manifestFile;
          }),
        },
      },
    });

    return {
      importJobId: importJob.id,
      eventId: event.id,
      eventSlug: event.slug,
      files: preparedFiles.map((file) => ({
        clientId: file.clientId,
        photoId: file.photoId,
        originalKey: file.originalKey,
        originalFilename: file.originalFilename,
        originalMimeType: file.originalMimeType,
        originalByteSize: file.originalByteSize,
        uploadMethod: file.upload.method,
        uploadUrl: file.upload.url,
        uploadHeaders: file.upload.headers,
      })),
    };
  } catch (error) {
    await prisma.importJob.update({
      where: { id: importJob.id },
      data: {
        status: "FAILED",
        errorMessage:
          error instanceof Error ? error.message : "Could not prepare uploads.",
        finishedAt: new Date(),
      },
    });

    throw error;
  }
}

export async function completeDirectUploadSession(args: {
  adminId: string;
  importJobId: string;
  uploadedClientIds: string[];
  failedUploads: FailedUpload[];
}) {
  const buckets = await getStorageBuckets();
  const importJob = await prisma.importJob.findUnique({
    where: {
      id: args.importJobId,
    },
    select: {
      id: true,
      type: true,
      requestedById: true,
      eventId: true,
      payloadJson: true,
    },
  });

  if (!importJob || importJob.type !== "MANUAL_UPLOAD") {
    throw new Error("Upload session not found.");
  }

  if (importJob.requestedById && importJob.requestedById !== args.adminId) {
    throw new Error("This upload session belongs to another admin.");
  }

  const payload = parseManualUploadPayload(importJob.payloadJson);

  if (!payload || payload.eventId !== importJob.eventId) {
    throw new Error("Upload session payload is invalid.");
  }

  const requestedIds = [...new Set(args.uploadedClientIds.map((id) => id.trim()).filter(Boolean))];

  if (!requestedIds.length && !args.failedUploads.length) {
    throw new Error("No uploaded files were provided for registration.");
  }

  const manifestByClientId = new Map(
    payload.files.map((file) => [file.clientId, file]),
  );
  const requestedFiles = requestedIds
    .map((clientId) => manifestByClientId.get(clientId))
    .filter((file): file is z.infer<typeof manualUploadPayloadSchema>["files"][number] =>
      Boolean(file),
    );

  const existingPhotos = requestedFiles.length
    ? await prisma.photo.findMany({
        where: {
          id: {
            in: requestedFiles.map((file) => file.photoId),
          },
        },
        select: {
          id: true,
        },
      })
    : [];

  const existingPhotoIds = new Set(existingPhotos.map((photo) => photo.id));
  const maxSortOrder = await prisma.photo.aggregate({
    where: {
      eventId: payload.eventId,
    },
    _max: {
      sortOrder: true,
    },
  });

  const readyToCreate: Array<z.infer<typeof manualUploadPayloadSchema>["files"][number]> = [];
  const verificationFailures: FailedUpload[] = [];

  for (const file of requestedFiles) {
    try {
      const object = await headObject({
        bucket: buckets.originals,
        key: file.originalKey,
      });

      if (
        typeof object.contentLength === "number" &&
        object.contentLength > 0 &&
        object.contentLength !== file.originalByteSize
      ) {
        verificationFailures.push({
          clientId: file.clientId,
          error: `${file.originalFilename} uploaded with an unexpected size.`,
        });
        continue;
      }

      if (!existingPhotoIds.has(file.photoId)) {
        readyToCreate.push(file);
      }
    } catch (error) {
      verificationFailures.push({
        clientId: file.clientId,
        error:
          error instanceof Error
            ? `${file.originalFilename}: ${error.message}`
            : `${file.originalFilename}: upload verification failed.`,
      });
    }
  }

  const createBaseSortOrder = (maxSortOrder._max.sortOrder ?? -1) + 1;

  if (readyToCreate.length) {
    await prisma.$transaction(
      readyToCreate.map((file, index) =>
        prisma.photo.create({
          data: {
            id: file.photoId,
            eventId: payload.eventId,
            originalKey: file.originalKey,
            originalFilename: file.originalFilename,
            originalMimeType: file.originalMimeType,
            originalByteSize: BigInt(file.originalByteSize),
            sortOrder: createBaseSortOrder + index,
          },
        }),
      ),
    );

    await syncEventPhotoOrder(payload.eventId);

    await Promise.all(
      readyToCreate.map((file) => enqueuePhotoProcessing(file.photoId)),
    );
  }

  const allFailures = [...args.failedUploads, ...verificationFailures];
  const successfulCount = requestedFiles.length - verificationFailures.length;
  const status = allFailures.length ? "FAILED" : "SUCCEEDED";

  await prisma.importJob.update({
    where: { id: importJob.id },
    data: {
      status,
      processedItems: successfulCount,
      errorMessage: summarizeFailedUploads(allFailures),
      finishedAt: new Date(),
    },
  });

  return {
    status,
    eventId: payload.eventId,
    eventSlug: payload.eventSlug,
    queuedCount: readyToCreate.length,
    alreadyRegisteredCount: successfulCount - readyToCreate.length,
    failedCount: allFailures.length,
    failures: allFailures,
  };
}
