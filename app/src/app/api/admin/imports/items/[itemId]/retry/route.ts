import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getCurrentAdmin } from "@/lib/auth";
import { retryStorageImportItem } from "@/lib/imports";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { itemId } = await params;

  try {
    await retryStorageImportItem(itemId);

    revalidatePath("/admin");
    revalidatePath("/admin/imports");
    revalidatePath("/admin/events");

    return NextResponse.json({
      message: "Import item retry queued.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to retry import item.",
      },
      { status: 500 },
    );
  }
}
