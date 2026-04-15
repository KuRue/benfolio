import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentAdmin } from "@/lib/auth";
import { applyImportBulkAction } from "@/lib/imports";

const bulkActionSchema = z.object({
  action: z.enum(["retry-failed", "retry-cleanup-failed", "dismiss-terminal"]),
  filters: z
    .object({
      status: z.string().optional().nullable(),
      query: z.string().optional().nullable(),
      visibility: z.string().optional().nullable(),
    })
    .optional(),
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

  const parsed = bulkActionSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid bulk action payload." }, { status: 400 });
  }

  try {
    const summary = await applyImportBulkAction(parsed.data);

    revalidatePath("/admin");
    revalidatePath("/admin/imports");
    revalidatePath("/admin/events");

    const message =
      parsed.data.action === "dismiss-terminal"
        ? `Dismissed ${summary.updatedCount} completed or skipped import items from the active queue.`
        : `Queued ${summary.updatedCount} import items across ${"jobsQueued" in summary ? summary.jobsQueued : 0} jobs.`;

    return NextResponse.json({
      message,
      summary,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to apply import bulk action.",
      },
      { status: 500 },
    );
  }
}
