import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getCurrentAdmin } from "@/lib/auth";
import { deletePhotoSafely, updatePhotoMetadata } from "@/lib/admin-photo-operations";
import { prisma } from "@/lib/prisma";

function asOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function getPhotoContext(photoId: string) {
  return prisma.photo.findUnique({
    where: { id: photoId },
    select: {
      id: true,
      eventId: true,
      event: {
        select: {
          slug: true,
          visibility: true,
        },
      },
    },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ photoId: string }> },
) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { photoId } = await params;
  const photo = await getPhotoContext(photoId);

  if (!photo) {
    return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  }

  try {
    const body = (await request.json()) as {
      caption?: string | null;
      altText?: string | null;
      takenAtOverride?: string | null;
      isHighlight?: boolean;
    };
    const shouldUpdateMetadata =
      "caption" in body || "altText" in body || "takenAtOverride" in body;

    if (shouldUpdateMetadata) {
      const takenAtOverrideInput =
        typeof body.takenAtOverride === "string" ? body.takenAtOverride.trim() : "";
      const takenAtOverride = takenAtOverrideInput
        ? new Date(takenAtOverrideInput)
        : null;

      if (takenAtOverride && Number.isNaN(takenAtOverride.getTime())) {
        return NextResponse.json(
          { error: "Use a valid date and time for the override." },
          { status: 400 },
        );
      }

      await updatePhotoMetadata({
        photoId,
        caption: asOptionalString(body.caption),
        altText: asOptionalString(body.altText),
        takenAtOverride,
      });
    }

    if (typeof body.isHighlight === "boolean") {
      await prisma.photo.update({
        where: {
          id: photoId,
        },
        data: {
          isHighlight: body.isHighlight,
        },
      });
    }

    if (!shouldUpdateMetadata && typeof body.isHighlight !== "boolean") {
      return NextResponse.json({ error: "No photo updates provided." }, { status: 400 });
    }

    if (photo.event.visibility === "PUBLIC" && typeof body.isHighlight === "boolean") {
      revalidatePath("/");
    }
    revalidatePath(`/admin/events/${photo.eventId}`);
    revalidatePath(`/e/${photo.event.slug}`);
    revalidatePath(`/p/${photoId}`);

    return NextResponse.json({
      message:
        typeof body.isHighlight === "boolean" && !shouldUpdateMetadata
          ? body.isHighlight
            ? "Photo added to highlights."
            : "Photo removed from highlights."
          : "Photo details updated.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to update photo details.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ photoId: string }> },
) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { photoId } = await params;
  const photo = await getPhotoContext(photoId);

  if (!photo) {
    return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  }

  try {
    await deletePhotoSafely(photoId);

    revalidatePath("/");
    revalidatePath("/admin");
    revalidatePath("/admin/settings");
    revalidatePath(`/admin/events/${photo.eventId}`);
    revalidatePath(`/e/${photo.event.slug}`);
    revalidatePath(`/p/${photoId}`);

    return NextResponse.json({
      message: "Photo deleted.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to delete photo.",
      },
      { status: 500 },
    );
  }
}
