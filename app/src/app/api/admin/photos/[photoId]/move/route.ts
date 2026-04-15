import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getCurrentAdmin } from "@/lib/auth";
import { movePhotoWithinEvent } from "@/lib/admin-photo-operations";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
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

  try {
    const body = (await request.json()) as {
      direction?: string;
    };

    const direction =
      body.direction === "earlier" || body.direction === "later"
        ? body.direction
        : null;

    if (!direction) {
      return NextResponse.json(
        { error: "Choose an order direction." },
        { status: 400 },
      );
    }

    await movePhotoWithinEvent({
      eventId: photo.eventId,
      photoId,
      direction,
    });

    revalidatePath(`/admin/events/${photo.eventId}`);
    revalidatePath(`/e/${photo.event.slug}`);

    return NextResponse.json({
      message: direction === "earlier" ? "Moved earlier." : "Moved later.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to update order.",
      },
      { status: 500 },
    );
  }
}
