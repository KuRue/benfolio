import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentAdmin } from "@/lib/auth";
import { recordDuplicateReviewDecision } from "@/lib/admin-duplicates";

const duplicateReviewSchema = z.object({
  scope: z.enum(["LIBRARY", "EVENT"]),
  eventId: z.string().optional().nullable(),
  hash: z.string().min(1),
  decision: z.enum(["KEEP_BOTH", "DISMISSED"]),
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

  const parsed = duplicateReviewSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid duplicate review payload." },
      { status: 400 },
    );
  }

  try {
    const summary = await recordDuplicateReviewDecision({
      scope: parsed.data.scope,
      eventId: parsed.data.eventId?.trim() || null,
      hash: parsed.data.hash.trim(),
      decision: parsed.data.decision,
    });

    revalidatePath("/admin/duplicates");

    if (parsed.data.scope === "EVENT" && parsed.data.eventId?.trim()) {
      revalidatePath(`/admin/events/${parsed.data.eventId.trim()}`);
    }

    return NextResponse.json({
      message:
        parsed.data.decision === "KEEP_BOTH"
          ? `Marked ${summary.reviewedCount} photos as reviewed duplicates to keep.`
          : `Dismissed duplicate review for ${summary.reviewedCount} photos.`,
      summary,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to update duplicate review state.",
      },
      { status: 500 },
    );
  }
}
