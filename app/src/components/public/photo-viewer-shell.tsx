import { PhotoViewerClient } from "@/components/public/photo-viewer-client";
import { formatLongDate } from "@/lib/strings";
import { groupTagsByCategory } from "@/lib/tags";

type PhotoViewerShellProps = {
  viewer: {
    id: string;
    title: string | null;
    altText: string | null;
    caption: string | null;
    event: {
      title: string;
    };
    imageUrl: string | null;
    imageWidth: number;
    imageHeight: number;
    originalFilename: string;
    width: number | null;
    height: number | null;
    cameraMake: string | null;
    cameraModel: string | null;
    lensModel: string | null;
    focalLength: string | null;
    aperture: string | null;
    shutterSpeed: string | null;
    iso: number | null;
    capturedAt: Date | null;
    tags: Array<{
      id: string;
      name: string;
      slug: string;
      category: "CHARACTER" | "EVENT" | "SPECIES" | "MAKER" | "GENERAL";
    }>;
    eventHref: string;
    previousHref: string | null;
    nextHref: string | null;
  };
  isModal?: boolean;
  returnHref?: string | null;
};

function sanitizeReturnHref(value?: string | null) {
  if (!value) {
    return null;
  }

  if (!value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  return value;
}

function withReturnHref(href: string | null, returnHref: string | null) {
  if (!href) {
    return null;
  }

  if (!returnHref) {
    return href;
  }

  const params = new URLSearchParams();
  params.set("from", returnHref);
  return `${href}?${params.toString()}`;
}

export function PhotoViewerShell({
  viewer,
  isModal = false,
  returnHref,
}: PhotoViewerShellProps) {
  const normalizedReturnHref = sanitizeReturnHref(returnHref);
  const heading =
    viewer.title?.trim() ||
    viewer.caption?.trim() ||
    viewer.event.title;
  const subtitle =
    viewer.title?.trim() && viewer.caption?.trim()
      ? viewer.caption.trim()
      : null;
  const infoRows = [
    viewer.capturedAt
      ? { label: "Captured", value: formatLongDate(viewer.capturedAt) }
      : null,
    viewer.width && viewer.height
      ? { label: "Dimensions", value: `${viewer.width} × ${viewer.height}` }
      : null,
    viewer.cameraMake || viewer.cameraModel
      ? {
          label: "Camera",
          value: [viewer.cameraMake, viewer.cameraModel].filter(Boolean).join(" "),
        }
      : null,
    viewer.lensModel ? { label: "Lens", value: viewer.lensModel } : null,
    viewer.focalLength ? { label: "Focal length", value: viewer.focalLength } : null,
    viewer.aperture ? { label: "Aperture", value: viewer.aperture } : null,
    viewer.shutterSpeed ? { label: "Shutter", value: viewer.shutterSpeed } : null,
    viewer.iso ? { label: "ISO", value: String(viewer.iso) } : null,
    { label: "Original file", value: viewer.originalFilename },
  ].filter(Boolean) as Array<{ label: string; value: string }>;
  const tagGroups = groupTagsByCategory(viewer.tags);

  return (
    <PhotoViewerClient
      imageUrl={viewer.imageUrl}
      imageWidth={viewer.imageWidth}
      imageHeight={viewer.imageHeight}
      alt={viewer.altText ?? heading}
      title={heading}
      subtitle={subtitle ?? ""}
      eventTitle={viewer.event.title}
      eventHref={viewer.eventHref}
      downloadHref={`/download/${viewer.id}`}
      previousHref={withReturnHref(viewer.previousHref, normalizedReturnHref)}
      nextHref={withReturnHref(viewer.nextHref, normalizedReturnHref)}
      closeHref={normalizedReturnHref ?? (!isModal ? viewer.eventHref : undefined)}
      infoRows={infoRows}
      tagGroups={tagGroups}
      isModal={isModal}
    />
  );
}
