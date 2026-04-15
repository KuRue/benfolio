import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { replacePhotoTags } from "@/lib/admin-tags";
import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const tagDraftSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  slug: z.string().min(1).optional(),
  category: z.enum(["CHARACTER", "EVENT", "SPECIES", "MAKER", "GENERAL"]),
});

const addTagsSchema = z.object({
  tags: z.array(tagDraftSchema).min(1).max(20),
});

const removeTagsSchema = z.object({
  tags: z.array(tagDraftSchema).min(1).max(20),
});

async function getPhotoContext(photoId: string) {
  return prisma.photo.findUnique({
    where: { id: photoId },
    select: {
      id: true,
      eventId: true,
      event: {
        select: {
          slug: true,
        },
      },
    },
  });
}

function revalidatePhotoContext(photo: NonNullable<Awaited<ReturnType<typeof getPhotoContext>>>) {
  revalidatePath(`/admin/events/${photo.eventId}`);
  revalidatePath(`/e/${photo.event.slug}`);
  revalidatePath(`/p/${photo.id}`);
}

export async function POST(
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

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = addTagsSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid tag payload." }, { status: 400 });
  }

  try {
    const result = await replacePhotoTags({
      photoId,
      add: parsed.data.tags,
    });

    revalidatePhotoContext(photo);

    return NextResponse.json({
      message:
        result.addedTagCount === 1
          ? "Tag added to photo."
          : `${result.addedTagCount} tags applied to the photo.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to update photo tags.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
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

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = removeTagsSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid tag payload." }, { status: 400 });
  }

  try {
    const result = await replacePhotoTags({
      photoId,
      remove: parsed.data.tags,
    });

    revalidatePhotoContext(photo);

    return NextResponse.json({
      message:
        result.removedTagCount === 1
          ? "Tag removed from photo."
          : `${result.removedTagCount} tags removed from the photo.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to update photo tags.",
      },
      { status: 500 },
    );
  }
}
