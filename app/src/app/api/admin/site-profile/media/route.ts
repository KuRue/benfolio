import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getCurrentAdmin } from "@/lib/auth";
import { setSiteProfileImageFromPhoto } from "@/lib/admin-photo-operations";

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      slot?: string;
      photoId?: string;
    };

    const slot = body.slot === "avatar" ? "avatar" : body.slot === "cover" ? "cover" : null;
    const photoId = typeof body.photoId === "string" ? body.photoId : "";

    if (!slot || !photoId) {
      return NextResponse.json(
        { error: "Choose a processed photo first." },
        { status: 400 },
      );
    }

    await setSiteProfileImageFromPhoto(slot, photoId);

    revalidatePath("/");
    revalidatePath("/admin");
    revalidatePath("/admin/settings");

    return NextResponse.json({
      message: slot === "cover" ? "Hero image updated." : "Avatar updated.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to update profile media.",
      },
      { status: 500 },
    );
  }
}
