import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getCurrentAdmin } from "@/lib/auth";
import { setEventCoverFromPhoto } from "@/lib/admin-photo-operations";
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
    await setEventCoverFromPhoto(photoId);

    revalidatePath("/");
    revalidatePath("/admin");
    revalidatePath(`/admin/events/${photo.eventId}`);
    revalidatePath(`/e/${photo.event.slug}`);

    return NextResponse.json({
      message: "Event cover updated.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to update cover image.",
      },
      { status: 500 },
    );
  }
}
