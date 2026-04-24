import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { importFurtrackTagsForPhoto } from "@/lib/admin-furtrack";
import { getCurrentAdmin } from "@/lib/auth";

const furtrackImportSchema = z.object({
  reference: z.string().min(1).max(2000),
});

type FurtrackPhotoRouteContext = {
  params: Promise<{
    photoId: string;
  }>;
};

export async function POST(request: Request, context: FurtrackPhotoRouteContext) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { photoId } = await context.params;
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = furtrackImportSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a Furtrack post URL, post ID, or tag list." },
      { status: 400 },
    );
  }

  try {
    const result = await importFurtrackTagsForPhoto({
      photoId,
      reference: parsed.data.reference,
      requestedById: admin.id,
    });

    revalidatePath(`/admin/events/${result.eventId}`);
    revalidatePath("/admin/tags");
    revalidatePath(`/p/${photoId}`);

    if (result.eventVisibility === "PUBLIC") {
      revalidatePath("/");
      revalidatePath(`/e/${result.eventSlug}`);
    }

    return NextResponse.json({
      message: result.externalPostId
        ? `Imported ${result.importedTagCount} Furtrack tags from post ${result.externalPostId}.`
        : `Imported ${result.importedTagCount} Furtrack tags.`,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to import Furtrack tags.",
      },
      { status: 500 },
    );
  }
}
