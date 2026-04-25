import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { refreshFurtrackLinkedTagsForEvent } from "@/lib/admin-furtrack";
import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const refreshLinkedSchema = z.object({
  eventId: z.string().min(1),
});

/**
 * Re-imports Furtrack tags for every photo in the event that has an
 * existing FURTRACK / PHOTO_POST link. The match-test panel calls this
 * before kicking off "Find matches" so already-paired photos get fresh
 * tags silently and don't need to be re-confirmed.
 */
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

  const parsed = refreshLinkedSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid Furtrack refresh-linked payload." },
      { status: 400 },
    );
  }

  try {
    const event = await prisma.event.findUnique({
      where: { id: parsed.data.eventId },
      select: { id: true, slug: true, visibility: true },
    });

    if (!event) {
      return NextResponse.json(
        { error: "Event not found." },
        { status: 404 },
      );
    }

    const result = await refreshFurtrackLinkedTagsForEvent({
      eventId: event.id,
      requestedById: admin.id,
    });

    if (result.refreshed > 0) {
      revalidatePath(`/admin/events/${event.id}`);
      revalidatePath("/admin/tags");
      if (event.visibility === "PUBLIC") {
        revalidatePath(`/e/${event.slug}`);
      }
    }

    return NextResponse.json({
      message:
        result.totalLinked === 0
          ? "No previously-linked Furtrack photos to refresh."
          : `Refreshed Furtrack tags on ${result.refreshed} of ${result.totalLinked} linked photos${
              result.failed ? ` (${result.failed} failed)` : ""
            }.`,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to refresh Furtrack-linked tags.",
      },
      { status: 500 },
    );
  }
}
