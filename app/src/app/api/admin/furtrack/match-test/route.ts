import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentAdmin } from "@/lib/auth";
import {
  testFurtrackMatchesForEvent,
  testFurtrackMatchesForPhoto,
} from "@/lib/furtrack-match";

const matchTestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("photo"),
    photoId: z.string().min(1),
    tags: z.array(z.string().min(1)).max(10).optional(),
    postIds: z.array(z.string().min(1)).max(500).optional(),
    pagesPerTag: z.number().int().min(1).max(10).optional(),
    maxCandidates: z.number().int().min(1).max(500).optional(),
    minScore: z.number().min(0).max(1).optional(),
  }),
  z.object({
    mode: z.literal("event"),
    eventId: z.string().min(1),
    tags: z.array(z.string().min(1)).max(10).optional(),
    postIds: z.array(z.string().min(1)).max(2000).optional(),
    pagesPerTag: z.number().int().min(1).max(10).optional(),
    maxCandidates: z.number().int().min(1).max(2000).optional(),
    maxPhotos: z.number().int().min(1).max(500).optional(),
    minScore: z.number().min(0).max(1).optional(),
  }),
]);

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

  const parsed = matchTestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid Furtrack match test payload.",
      },
      { status: 400 },
    );
  }

  try {
    const result =
      parsed.data.mode === "event"
        ? await testFurtrackMatchesForEvent(parsed.data)
        : await testFurtrackMatchesForPhoto(parsed.data);

    return NextResponse.json({
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to test Furtrack matches.",
      },
      { status: 500 },
    );
  }
}
