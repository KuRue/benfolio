import type { Metadata } from "next";

import { notFound } from "next/navigation";

import { PhotoViewerShell } from "@/components/public/photo-viewer-shell";
import { trackPhotoView } from "@/lib/analytics";
import { getPhotoViewerData } from "@/lib/gallery";
import { absoluteUrl } from "@/lib/strings";

export const dynamic = "force-dynamic";

type PhotoPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    from?: string;
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

  const title = viewer.title ?? viewer.event.title;
  const description =
    viewer.caption ?? `Canonical photo route for ${viewer.event.title}.`;
  const ogImages = viewer.imageUrl
    ? [
        {
          url: absoluteUrl(viewer.imageUrl),
          width: viewer.imageWidth,
          height: viewer.imageHeight,
        },
      ]
    : undefined;

  return {
    title,
    description,
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
      title,
      description,
      url: absoluteUrl(`/p/${viewer.id}`),
      images: ogImages,
    },
    twitter: {
      card: viewer.imageUrl ? "summary_large_image" : "summary",
      title,
      description,
      images: ogImages,
    },
  };
}

export default async function PhotoPage({ params, searchParams }: PhotoPageProps) {
  const { id } = await params;
  const { from } = await searchParams;
  const [viewer] = await Promise.all([
    getPhotoViewerData(id),
    trackPhotoView(id),
  ]);

  if (!viewer) {
    notFound();
  }

  return <PhotoViewerShell viewer={viewer} returnHref={from} />;
}
