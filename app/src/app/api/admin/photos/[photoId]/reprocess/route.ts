import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getCurrentAdmin } from "@/lib/auth";
import { queuePhotoReprocessing } from "@/lib/admin-photo-operations";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ photoId: string }> },
) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { photoId } = await params;
  const photo = await prisma.photo.findUnique({
    where: { id: photoId },
    select: {
      processingState: true,
      eventId: true,
      event: {
        select: {
          slug: true,
        },
      },
    },
  });

  if (!photo) {
    return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  }

  if (photo.processingState !== "READY" && photo.processingState !== "FAILED") {
    return NextResponse.json(
      { error: "Only ready or failed photos can be requeued." },
      { status: 400 },
    );
  }

  try {
    await queuePhotoReprocessing(photoId);

    revalidatePath(`/admin/events/${photo.eventId}`);
    revalidatePath(`/e/${photo.event.slug}`);
    revalidatePath(`/p/${photoId}`);

    return NextResponse.json({
      message:
        photo.processingState === "FAILED"
          ? "Retry queued."
          : "Photo queued for reprocessing.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to queue processing.",
      },
      { status: 500 },
    );
  }
}
