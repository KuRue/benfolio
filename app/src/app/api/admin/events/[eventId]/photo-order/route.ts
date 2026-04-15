import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getCurrentAdmin } from "@/lib/auth";
import { resetEventPhotoOrderToAutomatic } from "@/lib/admin-photo-operations";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { eventId } = await params;
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      slug: true,
    },
  });

  if (!event) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  try {
    const body = (await request.json()) as {
      mode?: string;
    };

    if (body.mode !== "AUTO") {
      return NextResponse.json(
        { error: "Only automatic reset is supported here." },
        { status: 400 },
      );
    }

    await resetEventPhotoOrderToAutomatic(eventId);

    revalidatePath(`/admin/events/${eventId}`);
    revalidatePath(`/e/${event.slug}`);

    return NextResponse.json({
      message: "Automatic photo order restored.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to reset automatic order.",
      },
      { status: 500 },
    );
  }
}
