import "server-only";

import { getResolvedRuntimeSettings } from "@/lib/app-settings";
import { prisma } from "@/lib/prisma";
import { getEffectiveTakenAt } from "@/lib/photo-order";
import { buildDisplayUrl } from "@/lib/storage";

const HOMEPAGE_HIGHLIGHT_LIMIT = 18;

const defaultSiteProfile = {
  id: "default",
  displayName: "Your Studio",
  handle: null,
  headline: "Event photography arranged with the feel of the original night.",
  bio: "A mobile-first archive for event coverage, client galleries, and private releases.",
  aboutBio: null,
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

type CoverBlurSource = {
  blurDataUrl: string | null;
  dominantColor: string | null;
};

/**
 * Given a set of `originalKey` values used as event / site covers, fetch the
 * matching Photo rows and return a lookup keyed by originalKey. We only need
 * the blur + tint here — everything else comes from the event itself.
 */
async function fetchCoverBlurs(
  originalKeys: Array<string | null | undefined>,
): Promise<Map<string, CoverBlurSource>> {
  const keys = Array.from(
    new Set(originalKeys.filter((k): k is string => Boolean(k))),
  );
  if (keys.length === 0) return new Map();

  const photos = await prisma.photo.findMany({
    where: { originalKey: { in: keys } },
    select: {
      originalKey: true,
      blurDataUrl: true,
      dominantColor: true,
    },
  });

  const map = new Map<string, CoverBlurSource>();
  for (const photo of photos) {
    if (!map.has(photo.originalKey)) {
      map.set(photo.originalKey, {
        blurDataUrl: photo.blurDataUrl,
        dominantColor: photo.dominantColor,
      });
    }
  }
  return map;
}

export async function getSiteProfile() {
  const siteProfile = await prisma.siteProfile.findUnique({
    where: { id: "default" },
  });

  const merged = {
    ...defaultSiteProfile,
    ...siteProfile,
  };

  const coverBlur = merged.coverOriginalKey
    ? (
        await prisma.photo.findFirst({
          where: { originalKey: merged.coverOriginalKey },
          select: { blurDataUrl: true, dominantColor: true },
        })
      ) ?? null
    : null;

  return {
    ...merged,
    coverBlurDataUrl: coverBlur?.blurDataUrl ?? null,
    coverDominantColor: coverBlur?.dominantColor ?? null,
  };
}

export async function getHomepageData() {
  const [siteProfile, runtimeSettings, events, highlights] = await Promise.all([
    getSiteProfile(),
    getResolvedRuntimeSettings(),
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
    prisma.photo.findMany({
      where: {
        isHighlight: true,
        processingState: "READY",
        event: {
          visibility: "PUBLIC",
        },
      },
      orderBy: [{ capturedAt: "desc" }, { createdAt: "desc" }, { id: "asc" }],
      take: HOMEPAGE_HIGHLIGHT_LIMIT,
      include: {
        event: {
          select: {
            title: true,
            slug: true,
            eventDate: true,
            eventEndDate: true,
          },
        },
        derivatives: {
          orderBy: {
            width: "desc",
          },
        },
      },
    }),
  ]);

  const coverBlurs = await fetchCoverBlurs(
    events.map((event) => event.coverOriginalKey),
  );

  const enrichedEvents = events.map((event) => {
    const blur = event.coverOriginalKey
      ? coverBlurs.get(event.coverOriginalKey)
      : undefined;
    return {
      ...event,
      coverBlurDataUrl: blur?.blurDataUrl ?? null,
      coverDominantColor: blur?.dominantColor ?? null,
    };
  });

  const enrichedHighlights = highlights.map((photo) => {
    const gridDerivative = pickDerivative(photo.derivatives, "GRID");
    const viewerDerivative = pickDerivative(photo.derivatives, "VIEWER");
    const thumbnailDerivative = pickDerivative(photo.derivatives, "THUMBNAIL");
    const displayDerivative =
      gridDerivative ?? viewerDerivative ?? thumbnailDerivative;

    return {
      id: photo.id,
      caption: photo.caption,
      altText: photo.altText,
      originalFilename: photo.originalFilename,
      width: displayDerivative?.width ?? photo.width ?? 1200,
      height: displayDerivative?.height ?? photo.height ?? 1500,
      displayKey: displayDerivative?.storageKey ?? null,
      imageUrl: buildDisplayUrl(displayDerivative?.storageKey),
      blurDataUrl: photo.blurDataUrl,
      dominantColor: photo.dominantColor,
      event: photo.event,
    };
  });

  return {
    siteProfile,
    runtimeSettings,
    events: enrichedEvents,
    highlights: enrichedHighlights,
  };
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

  // Reuse the cover photo's blur/tint if it lives in this event's own
  // photo list — avoids a second query. Otherwise fall back to a lookup.
  const coverFromEvent = event.coverOriginalKey
    ? event.photos.find(
        (photo) => photo.originalKey === event.coverOriginalKey,
      )
    : null;
  const coverBlur = coverFromEvent
    ? {
        blurDataUrl: coverFromEvent.blurDataUrl,
        dominantColor: coverFromEvent.dominantColor,
      }
    : event.coverOriginalKey
    ? (
        await prisma.photo.findFirst({
          where: { originalKey: event.coverOriginalKey },
          select: { blurDataUrl: true, dominantColor: true },
        })
      ) ?? null
    : null;

  return {
    ...event,
    coverBlurDataUrl: coverBlur?.blurDataUrl ?? null,
    coverDominantColor: coverBlur?.dominantColor ?? null,
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

type PhotoViewerSequence = "event" | "highlights";

export async function getPhotoViewerData(
  photoId: string,
  options?: {
    sequence?: PhotoViewerSequence;
  },
) {
  const [runtimeSettings, photo] = await Promise.all([
    getResolvedRuntimeSettings(),
    prisma.photo.findUnique({
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
    }),
  ]);

  if (!photo || photo.event.visibility === "DRAFT") {
    return null;
  }

  // Also pull the VIEWER derivative for the immediate neighbours so the client
  // can preload them — by the time the user swipes/arrows, the bytes are cached.
  const neighbourDerivativeSelect = {
    id: true,
    derivatives: {
      where: { kind: "VIEWER" as const },
      orderBy: { width: "desc" as const },
      take: 1,
      select: { storageKey: true },
    },
  };

  let navigationContext: PhotoViewerSequence = "event";
  let previousPhoto: {
    id: string;
    derivatives: Array<{ storageKey: string }>;
  } | null = null;
  let nextPhoto: {
    id: string;
    derivatives: Array<{ storageKey: string }>;
  } | null = null;

  if (options?.sequence === "highlights") {
    const highlightPhotos = await prisma.photo.findMany({
      where: {
        isHighlight: true,
        processingState: "READY",
        event: {
          visibility: "PUBLIC",
        },
      },
      orderBy: [{ capturedAt: "desc" }, { createdAt: "desc" }, { id: "asc" }],
      take: HOMEPAGE_HIGHLIGHT_LIMIT,
      select: neighbourDerivativeSelect,
    });
    const highlightIndex = highlightPhotos.findIndex(
      (highlightPhoto) => highlightPhoto.id === photo.id,
    );

    if (highlightIndex >= 0) {
      navigationContext = "highlights";
      previousPhoto = highlightPhotos[highlightIndex - 1] ?? null;
      nextPhoto = highlightPhotos[highlightIndex + 1] ?? null;
    }
  }

  if (navigationContext === "event") {
    [previousPhoto, nextPhoto] = await Promise.all([
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
        select: neighbourDerivativeSelect,
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
        select: neighbourDerivativeSelect,
      }),
    ]);
  }

  const viewerDerivative = pickDerivative(photo.derivatives, "VIEWER");
  const gridDerivative = pickDerivative(photo.derivatives, "GRID");
  const thumbnailDerivative = pickDerivative(photo.derivatives, "THUMBNAIL");

  const placeholderKey =
    gridDerivative?.storageKey ?? thumbnailDerivative?.storageKey ?? null;

  return {
    ...photo,
    capturedAt: getEffectiveTakenAt(photo),
    eventHref: `/e/${photo.event.slug}`,
    navigationContext,
    previousHref: previousPhoto ? `/p/${previousPhoto.id}` : null,
    nextHref: nextPhoto ? `/p/${nextPhoto.id}` : null,
    imageUrl:
      buildDisplayUrl(viewerDerivative?.storageKey) ??
      buildDisplayUrl(gridDerivative?.storageKey),
    imageWidth: viewerDerivative?.width ?? gridDerivative?.width ?? photo.width ?? 1600,
    imageHeight:
      viewerDerivative?.height ?? gridDerivative?.height ?? photo.height ?? 2000,
    placeholderUrl: buildDisplayUrl(placeholderKey),
    previousImageUrl: buildDisplayUrl(
      previousPhoto?.derivatives[0]?.storageKey ?? null,
    ),
    nextImageUrl: buildDisplayUrl(nextPhoto?.derivatives[0]?.storageKey ?? null),
    robotsNoIndex: photo.event.visibility === "HIDDEN",
    downloadsEnabled: runtimeSettings.downloadsEnabled,
    blurDataUrl: photo.blurDataUrl,
    tags: photo.tags.map((photoTag) => photoTag.tag),
  };
}

export async function getPhotoDownloadData(photoId: string) {
  const runtimeSettings = await getResolvedRuntimeSettings();

  if (!runtimeSettings.downloadsEnabled) {
    return null;
  }

  return prisma.photo.findUnique({
    where: {
      id: photoId,
    },
    include: {
      event: true,
    },
  });
}
