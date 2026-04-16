import { notFound } from "next/navigation";

import { PhotoViewerShell } from "@/components/public/photo-viewer-shell";
import { getPhotoViewerData } from "@/lib/gallery";

type ModalPhotoPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    from?: string;
  }>;
};

export default async function ModalPhotoPage({
  params,
  searchParams,
}: ModalPhotoPageProps) {
  const { id } = await params;
  const { from } = await searchParams;
  const viewer = await getPhotoViewerData(id);

  if (!viewer) {
    notFound();
  }

  return <PhotoViewerShell viewer={viewer} isModal returnHref={from} />;
}
