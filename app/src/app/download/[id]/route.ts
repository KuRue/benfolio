import { NextResponse } from "next/server";

import { getPhotoDownloadData } from "@/lib/gallery";
import { readObject, storageBuckets } from "@/lib/storage";

type DownloadRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, { params }: DownloadRouteProps) {
  const { id } = await params;
  const photo = await getPhotoDownloadData(id);

  if (!photo || photo.event.visibility === "DRAFT") {
    return new NextResponse("Not found", { status: 404 });
  }

  const object = await readObject({
    bucket: storageBuckets.originals,
    key: photo.originalKey,
  });

  return new NextResponse(object.body, {
    headers: {
      "content-type": photo.originalMimeType,
      "content-disposition": `attachment; filename="${encodeURIComponent(
        photo.originalFilename,
      )}"`,
      "cache-control": "private, max-age=0, must-revalidate",
    },
  });
}
