import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentAdmin } from "@/lib/auth";
import { createFurtrackMatchRun } from "@/lib/furtrack-match";

const matchRunSchema = z.object({
  eventId: z.string().min(1),
  tags: z.array(z.string().min(1)).max(10).optional(),
  postIds: z.array(z.string().min(1)).max(2000).optional(),
  pagesPerTag: z.number().int().min(1).max(10).optional(),
  maxCandidates: z.number().int().min(1).max(2000).optional(),
  maxPhotos: z.number().int().min(1).max(500).optional(),
  minScore: z.number().min(0).max(1).optional(),
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

  const parsed = matchRunSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid Furtrack match run payload." },
      { status: 400 },
    );
  }

  try {
    const run = await createFurtrackMatchRun({
      ...parsed.data,
      requestedById: admin.id,
    });

    return NextResponse.json({ run });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to start Furtrack match run.",
      },
      { status: 500 },
    );
  }
}
