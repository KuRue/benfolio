import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentAdmin } from "@/lib/auth";
import { completeDirectUploadSession } from "@/lib/admin-upload-sessions";

const completeUploadSchema = z.object({
  importJobId: z.string().trim().min(1),
  uploadedClientIds: z.array(z.string().trim().min(1)).default([]),
  failedUploads: z
    .array(
      z.object({
        clientId: z.string().trim().min(1),
        error: z.string().trim().min(1),
      }),
    )
    .default([]),
});

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const input = completeUploadSchema.parse(body);
    const result = await completeDirectUploadSession({
      adminId: admin.id,
      ...input,
    });
    const message =
      result.queuedCount && result.alreadyRegisteredCount
        ? `Queued ${result.queuedCount} new files and confirmed ${result.alreadyRegisteredCount} already-registered uploads on /e/${result.eventSlug}.`
        : result.queuedCount
          ? `Queued ${result.queuedCount} files for processing on /e/${result.eventSlug}.`
          : `Confirmed ${result.alreadyRegisteredCount} uploads already registered on /e/${result.eventSlug}.`;

    return NextResponse.json({
      ...result,
      message,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Upload completion request is invalid." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not finalize uploaded originals.",
      },
      { status: 400 },
    );
  }
}
