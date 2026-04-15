import type { Metadata } from "next";

import { notFound } from "next/navigation";

import { PhotoViewerShell } from "@/components/public/photo-viewer-shell";
import { getPhotoViewerData } from "@/lib/gallery";
import { absoluteUrl } from "@/lib/strings";

export const dynamic = "force-dynamic";

type PhotoPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function generateMetadata({
  params,
}: PhotoPageProps): Promise<Metadata> {
  const { id } = await params;
  const viewer = await getPhotoViewerData(id);

  if (!viewer) {
    return {
      title: "Photo not found",
    };
  }

  return {
    title: viewer.title ?? viewer.event.title,
    description:
      viewer.caption ?? `Canonical photo route for ${viewer.event.title}.`,
    alternates: {
      canonical: `/p/${viewer.id}`,
    },
    robots: viewer.robotsNoIndex
      ? {
          index: false,
          follow: false,
        }
      : undefined,
    openGraph: {
      type: "article",
      title: viewer.title ?? viewer.event.title,
      description:
        viewer.caption ?? `Canonical photo route for ${viewer.event.title}.`,
      url: absoluteUrl(`/p/${viewer.id}`),
      images: viewer.imageUrl
        ? [
            {
              url: absoluteUrl(viewer.imageUrl),
              width: viewer.imageWidth,
              height: viewer.imageHeight,
            },
          ]
        : undefined,
    },
  };
}

export default async function PhotoPage({ params }: PhotoPageProps) {
  const { id } = await params;
  const viewer = await getPhotoViewerData(id);

  if (!viewer) {
    notFound();
  }

  return <PhotoViewerShell viewer={viewer} />;
}
