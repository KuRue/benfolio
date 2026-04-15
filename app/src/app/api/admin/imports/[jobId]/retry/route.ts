import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getCurrentAdmin } from "@/lib/auth";
import { retryStorageImportJob } from "@/lib/imports";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await params;

  try {
    await retryStorageImportJob(jobId);

    revalidatePath("/admin");
    revalidatePath("/admin/imports");
    revalidatePath("/admin/events");

    return NextResponse.json({
      message: "Failed import items were queued again.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to retry import job.",
      },
      { status: 500 },
    );
  }
}
