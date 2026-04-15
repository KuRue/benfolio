import { notFound } from "next/navigation";

import { PhotoViewerShell } from "@/components/public/photo-viewer-shell";
import { getPhotoViewerData } from "@/lib/gallery";

type ModalPhotoPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ModalPhotoPage({ params }: ModalPhotoPageProps) {
  const { id } = await params;
  const viewer = await getPhotoViewerData(id);

  if (!viewer) {
    notFound();
  }

  return <PhotoViewerShell viewer={viewer} isModal />;
}
