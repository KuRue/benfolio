import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { importFurtrackTagsForPhoto } from "@/lib/admin-furtrack";
import { getCurrentAdmin } from "@/lib/auth";

const syncMatchSchema = z.object({
  photoId: z.string().min(1),
  postId: z.string().min(1),
});

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = syncMatchSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid Furtrack match sync payload." },
      { status: 400 },
    );
  }

  try {
    const imported = await importFurtrackTagsForPhoto({
      photoId: parsed.data.photoId,
      reference: parsed.data.postId,
      requestedById: admin.id,
    });

    revalidatePath(`/admin/events/${imported.eventId}`);
    revalidatePath("/admin/tags");
    revalidatePath(`/p/${parsed.data.photoId}`);

    if (imported.eventVisibility === "PUBLIC") {
      revalidatePath("/");
      revalidatePath(`/e/${imported.eventSlug}`);
    }

    return NextResponse.json({
      message: `Synced Furtrack tags from post ${parsed.data.postId}.`,
      result: imported,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to sync Furtrack match.",
      },
      { status: 500 },
    );
  }
}
