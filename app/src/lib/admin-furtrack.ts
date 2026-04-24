import "server-only";

import type { Prisma } from "../../../prisma/generated/client/client";

import { addTagAlias } from "@/lib/admin-tag-governance";
import { bulkUpdatePhotoTags } from "@/lib/admin-tags";
import { loadFurtrackImportPayload } from "@/lib/furtrack";
import { prisma } from "@/lib/prisma";

export type FurtrackPhotoImportResult = {
  eventId: string;
  eventSlug: string;
  eventVisibility: "DRAFT" | "HIDDEN" | "PUBLIC";
  importedTagCount: number;
  aliasCount: number;
  externalPostId: string | null;
  externalUrl: string | null;
};

function tagKey(tag: {
  category: string;
  slug?: string | null;
}) {
  return `${tag.category}:${tag.slug ?? ""}`;
}

async function addAliasesForImportedTags(
  importedTags: Awaited<ReturnType<typeof loadFurtrackImportPayload>>["tags"],
) {
  const normalizedTagKeys = importedTags.map((tag) => ({
    category: tag.category,
    slug: tag.slug!,
  }));

  const resolvedTags = await prisma.tag.findMany({
    where: {
      OR: normalizedTagKeys,
    },
    select: {
      id: true,
      category: true,
      slug: true,
    },
  });

  const tagsByKey = new Map(resolvedTags.map((tag) => [tagKey(tag), tag]));
  let aliasCount = 0;

  for (const importedTag of importedTags) {
    const tag = tagsByKey.get(tagKey(importedTag));

    if (!tag) {
      continue;
    }

    for (const alias of importedTag.aliases) {
      try {
        await addTagAlias({
          tagId: tag.id,
          name: alias.name,
          slug: alias.slug,
        });
        aliasCount += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "";

        if (!/already|matches the canonical/i.test(message)) {
          throw error;
        }
      }
    }
  }

  return aliasCount;
}

async function linkFurtrackPost(args: {
  photoId: string;
  eventId: string;
  postId: string;
  externalUrl: string;
  metadataJson: Prisma.InputJsonValue;
}) {
  const where = {
    source_externalId_assetType: {
      source: "FURTRACK" as const,
      externalId: args.postId,
      assetType: "PHOTO_POST",
    },
  };

  const existing = await prisma.externalAssetLink.findUnique({
    where,
    select: {
      id: true,
      photoId: true,
    },
  });

  if (existing?.photoId && existing.photoId !== args.photoId) {
    throw new Error("That Furtrack post is already linked to another photo.");
  }

  await prisma.externalAssetLink.upsert({
    where,
    create: {
      source: "FURTRACK",
      assetType: "PHOTO_POST",
      externalId: args.postId,
      externalUrl: args.externalUrl,
      metadataJson: args.metadataJson,
      eventId: args.eventId,
      photoId: args.photoId,
    },
    update: {
      externalUrl: args.externalUrl,
      metadataJson: args.metadataJson,
      eventId: args.eventId,
      photoId: args.photoId,
    },
  });
}

export async function importFurtrackTagsForPhoto(args: {
  photoId: string;
  reference: string;
  requestedById?: string | null;
}): Promise<FurtrackPhotoImportResult> {
  const photo = await prisma.photo.findUnique({
    where: {
      id: args.photoId,
    },
    select: {
      id: true,
      eventId: true,
      event: {
        select: {
          slug: true,
          visibility: true,
        },
      },
    },
  });

  if (!photo) {
    throw new Error("Photo not found.");
  }

  const importPayload = await loadFurtrackImportPayload(args.reference);

  if (!importPayload.tags.length) {
    throw new Error("No Furtrack tags were found.");
  }

  const tagDrafts = importPayload.tags.map((tag) => ({
    name: tag.name,
    slug: tag.slug,
    category: tag.category,
  }));

  const tagUpdate = await bulkUpdatePhotoTags({
    photoIds: [photo.id],
    add: tagDrafts,
  });
  const aliasCount = await addAliasesForImportedTags(importPayload.tags);

  if (importPayload.source.kind === "post") {
    await linkFurtrackPost({
      photoId: photo.id,
      eventId: photo.eventId,
      postId: importPayload.source.postId,
      externalUrl: importPayload.source.externalUrl,
      metadataJson: {
        importedAt: new Date().toISOString(),
        tagCount: importPayload.tags.length,
        tags: importPayload.tags.map((tag) => ({
          category: tag.category,
          name: tag.name,
          slug: tag.slug,
          rawValues: tag.rawValues,
        })),
      },
    });
  }

  await prisma.importJob.create({
    data: {
      type: "FURTRACK_SYNC",
      source: "FURTRACK",
      status: "SUCCEEDED",
      eventId: photo.eventId,
      requestedById: args.requestedById ?? null,
      totalItems: 1,
      processedItems: 1,
      startedAt: new Date(),
      finishedAt: new Date(),
      payloadJson: {
        photoId: photo.id,
        reference: args.reference,
        sourceKind: importPayload.source.kind,
        externalPostId:
          importPayload.source.kind === "post" ? importPayload.source.postId : null,
        importedTagCount: importPayload.tags.length,
        aliasCount,
      },
    },
  });

  return {
    eventId: photo.eventId,
    eventSlug: photo.event.slug,
    eventVisibility: photo.event.visibility,
    importedTagCount: tagUpdate.addedTagCount,
    aliasCount,
    externalPostId:
      importPayload.source.kind === "post" ? importPayload.source.postId : null,
    externalUrl:
      importPayload.source.kind === "post" ? importPayload.source.externalUrl : null,
  };
}
