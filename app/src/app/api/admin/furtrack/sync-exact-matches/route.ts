import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { importFurtrackTagsForPhoto } from "@/lib/admin-furtrack";
import { getCurrentAdmin } from "@/lib/auth";
import { testFurtrackMatchesForEvent } from "@/lib/furtrack-match";

const exactSyncSchema = z.object({
  eventId: z.string().min(1),
  tags: z.array(z.string().min(1)).max(10).optional(),
  postIds: z.array(z.string().min(1)).max(2000).optional(),
  pagesPerTag: z.number().int().min(1).max(10).optional(),
  maxCandidates: z.number().int().min(1).max(2000).optional(),
  maxPhotos: z.number().int().min(1).max(500).optional(),
});
const AUTO_SYNC_SCORE = 0.9;

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

  const parsed = exactSyncSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid Furtrack exact-match sync payload." },
      { status: 400 },
    );
  }

  try {
    const matchResult = await testFurtrackMatchesForEvent({
      ...parsed.data,
      minScore: AUTO_SYNC_SCORE,
    });
    const autoSyncSuggestions = matchResult.suggestions.filter(
      (suggestion) => suggestion.bestMatch.score >= AUTO_SYNC_SCORE,
    );
    const synced: Array<{
      photoId: string;
      postId: string;
      importedTagCount: number;
      aliasCount: number;
    }> = [];
    const failed: Array<{
      photoId: string;
      postId: string;
      error: string;
    }> = [];

    for (const suggestion of autoSyncSuggestions) {
      try {
        const imported = await importFurtrackTagsForPhoto({
          photoId: suggestion.localPhoto.id,
          reference: suggestion.bestMatch.postId,
          requestedById: admin.id,
        });

        synced.push({
          photoId: suggestion.localPhoto.id,
          postId: suggestion.bestMatch.postId,
          importedTagCount: imported.importedTagCount,
          aliasCount: imported.aliasCount,
        });
      } catch (error) {
        failed.push({
          photoId: suggestion.localPhoto.id,
          postId: suggestion.bestMatch.postId,
          error:
            error instanceof Error ? error.message : "Unable to sync Furtrack tags.",
        });
      }
    }

    revalidatePath(`/admin/events/${matchResult.event.id}`);
    revalidatePath("/admin/tags");

    if (synced.length) {
      revalidatePath("/");
      revalidatePath(`/e/${matchResult.event.slug}`);
      for (const item of synced) {
        revalidatePath(`/p/${item.photoId}`);
      }
    }

    return NextResponse.json({
      message:
        synced.length === 1
          ? "Synced Furtrack tags for 1 90%+ match."
          : `Synced Furtrack tags for ${synced.length} 90%+ matches.`,
      result: {
        event: matchResult.event,
        exactMatchCount: autoSyncSuggestions.length,
        synced,
        failed,
        skippedCount: matchResult.suggestions.length - autoSyncSuggestions.length,
        candidateErrors: matchResult.errors,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to sync Furtrack 90%+ matches.",
      },
      { status: 500 },
    );
  }
}
