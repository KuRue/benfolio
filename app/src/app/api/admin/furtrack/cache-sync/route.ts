import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentAdmin } from "@/lib/auth";
import { enqueueFurtrackCacheSync } from "@/lib/furtrack-cache";

const cacheSyncSchema = z.object({
  tag: z.string().min(1).max(160),
  refreshExisting: z.boolean().optional(),
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

  const parsed = cacheSyncSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid Furtrack cache sync payload." },
      { status: 400 },
    );
  }

  try {
    const job = await enqueueFurtrackCacheSync({
      tag: parsed.data.tag,
      refreshExisting: parsed.data.refreshExisting ?? true,
      requestedById: admin.id,
    });

    return NextResponse.json({
      message: "Furtrack cache sync queued.",
      job,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to queue Furtrack cache sync.",
      },
      { status: 500 },
    );
  }
}
