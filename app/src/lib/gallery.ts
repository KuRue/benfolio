import "server-only";

import { prisma } from "@/lib/prisma";
import { getEffectiveTakenAt } from "@/lib/photo-order";
import { buildDisplayUrl } from "@/lib/storage";

const defaultSiteProfile = {
  id: "default",
  displayName: "Your Studio",
  handle: null,
  headline: "Event photography arranged with the feel of the original night.",
  bio: "A mobile-first archive for event coverage, client galleries, and private releases.",
  location: null,
  contactEmail: null,
  websiteUrl: null,
  instagramUrl: null,
  avatarOriginalKey: null,
  avatarDisplayKey: null,
  logoOriginalKey: null,
  logoDisplayKey: null,
  coverOriginalKey: null,
  coverDisplayKey: null,
  coverFocalX: 50,
  coverFocalY: 50,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

function pickDerivative(
  derivatives: Array<{
    kind: string;
    width: number;
    storageKey: string;
    height: number;
  }>,
  preferredKind: "GRID" | "VIEWER" | "THUMBNAIL",
) {
  const filtered = derivatives
    .filter((derivative) => derivative.kind === preferredKind)
    .sort((left, right) => right.width - left.width);

  const fallback = [...derivatives].sort((left, right) => right.width - left.width);

  return filtered[0] ?? fallback[0] ?? null;
}

export async function getSiteProfile() {
  const siteProfile = await prisma.siteProfile.findUnique({
    where: { id: "default" },
  });

  return {
    ...defaultSiteProfile,
    ...siteProfile,
  };
}

export async function getHomepageData() {
  const [siteProfile, events] = await Promise.all([
    getSiteProfile(),
    prisma.event.findMany({
      where: {
        visibility: "PUBLIC",
      },
      orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }],
      include: {
        _count: {
          select: {
            photos: true,
          },
        },
      },
    }),
  ]);

  return { siteProfile, events };
}

export async function getPublicEventBySlug(slug: string) {
  const event = await prisma.event.findFirst({
    where: {
      slug,
      visibility: {
        in: ["PUBLIC", "HIDDEN"],
      },
    },
    include: {
      photos: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          derivatives: {
            orderBy: {
              width: "asc",
            },
          },
        },
      },
    },
  });

  if (!event) {
    return null;
  }

  return {
    ...event,
    photos: event.photos.map((photo) => {
      const gridDerivative = pickDerivative(photo.derivatives, "GRID");
      const viewerDerivative = pickDerivative(photo.derivatives, "VIEWER");

      return {
        ...photo,
        altText: photo.altText,
        gridImageUrl: buildDisplayUrl(gridDerivative?.storageKey),
        gridWidth: gridDerivative?.width ?? photo.width ?? 1200,
        gridHeight: gridDerivative?.height ?? photo.height ?? 1500,
        viewerImageUrl: buildDisplayUrl(viewerDerivative?.storageKey),
      };
    }),
  };
}

export async function getPhotoViewerData(photoId: string) {
  const photo = await prisma.photo.findUnique({
    where: { id: photoId },
    include: {
      event: true,
      derivatives: {
        orderBy: {
          width: "asc",
        },
      },
      tags: {
        include: {
          tag: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  if (!photo || photo.event.visibility === "DRAFT") {
    return null;
  }

  const [previousPhoto, nextPhoto] = await Promise.all([
    prisma.photo.findFirst({
      where: {
        eventId: photo.eventId,
        sortOrder: {
          lt: photo.sortOrder,
        },
      },
      orderBy: {
        sortOrder: "desc",
      },
      select: {
        id: true,
      },
    }),
    prisma.photo.findFirst({
      where: {
        eventId: photo.eventId,
        sortOrder: {
          gt: photo.sortOrder,
        },
      },
      orderBy: {
        sortOrder: "asc",
      },
      select: {
        id: true,
      },
    }),
  ]);

  const viewerDerivative = pickDerivative(photo.derivatives, "VIEWER");
  const gridDerivative = pickDerivative(photo.derivatives, "GRID");

  return {
    ...photo,
    capturedAt: getEffectiveTakenAt(photo),
    eventHref: `/e/${photo.event.slug}`,
    previousHref: previousPhoto ? `/p/${previousPhoto.id}` : null,
    nextHref: nextPhoto ? `/p/${nextPhoto.id}` : null,
    imageUrl:
      buildDisplayUrl(viewerDerivative?.storageKey) ??
      buildDisplayUrl(gridDerivative?.storageKey),
    imageWidth: viewerDerivative?.width ?? gridDerivative?.width ?? photo.width ?? 1600,
    imageHeight:
      viewerDerivative?.height ?? gridDerivative?.height ?? photo.height ?? 2000,
    robotsNoIndex: photo.event.visibility === "HIDDEN",
    tags: photo.tags.map((photoTag) => photoTag.tag),
  };
}

export async function getPhotoDownloadData(photoId: string) {
  return prisma.photo.findUnique({
    where: {
      id: photoId,
    },
    include: {
      event: true,
    },
  });
}
