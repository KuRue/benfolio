import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const dismissSchema = z.object({
  photoId: z.string().min(1),
  postId: z.string().min(1),
});

/**
 * Persists a "this Furtrack post is not a match for this benfolio
 * photo" decision so the next match scan won't re-suggest the pair.
 * Idempotent — repeated POSTs keep the original `dismissedAt` via
 * the upsert no-op `update` clause.
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

  const parsed = dismissSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid Furtrack dismiss payload." },
      { status: 400 },
    );
  }

  try {
    // Make sure the photo exists before recording — keeps the table
    // free of orphaned dismissals if the request is forged or the
    // photo was just deleted.
    const photo = await prisma.photo.findUnique({
      where: { id: parsed.data.photoId },
      select: { id: true },
    });

    if (!photo) {
      return NextResponse.json(
        { error: "Photo not found." },
        { status: 404 },
      );
    }

    await prisma.furtrackMatchDismissal.upsert({
      where: {
        photoId_externalPostId: {
          photoId: parsed.data.photoId,
          externalPostId: parsed.data.postId,
        },
      },
      create: {
        photoId: parsed.data.photoId,
        externalPostId: parsed.data.postId,
      },
      update: {},
    });

    return NextResponse.json({
      message: `Dismissed Furtrack post ${parsed.data.postId} for photo ${parsed.data.photoId}.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to record Furtrack match dismissal.",
      },
      { status: 500 },
    );
  }
}

/**
 * Removes a dismissal — used if the admin wants the pair to be
 * re-suggested on the next scan. Body shape mirrors POST.
 */
export async function DELETE(request: Request) {
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

  const parsed = dismissSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid Furtrack dismiss payload." },
      { status: 400 },
    );
  }

  try {
    await prisma.furtrackMatchDismissal.deleteMany({
      where: {
        photoId: parsed.data.photoId,
        externalPostId: parsed.data.postId,
      },
    });

    return NextResponse.json({
      message: `Cleared Furtrack dismissal for photo ${parsed.data.photoId} and post ${parsed.data.postId}.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to clear Furtrack match dismissal.",
      },
      { status: 500 },
    );
  }
}
