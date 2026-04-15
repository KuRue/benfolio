import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getCurrentAdmin } from "@/lib/auth";
import { scanAndEnqueueStorageImports } from "@/lib/imports";

export async function POST() {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await scanAndEnqueueStorageImports(admin.id);

    revalidatePath("/admin");
    revalidatePath("/admin/events");
    revalidatePath("/admin/imports");
    revalidatePath("/admin/uploads");

    return NextResponse.json({
      message:
        summary.jobsCreated > 0
          ? `Recorded ${summary.itemsCreated} import items across ${summary.jobsCreated} jobs, with ${summary.itemsQueued} queued for processing.`
          : "No new import objects were queued.",
      summary,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to scan imports.",
      },
      { status: 500 },
    );
  }
}
