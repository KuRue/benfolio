import { NextResponse } from "next/server";
import { z } from "zod";

import { mergeTags } from "@/lib/admin-tag-governance";
import { revalidateAdminTagPaths } from "@/lib/admin-tag-revalidation";
import { getCurrentAdmin } from "@/lib/auth";

const mergeTagsSchema = z.object({
  destinationTagId: z.string().min(1),
});

type RouteContext = {
  params: Promise<{
    tagId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
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

  const parsed = mergeTagsSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid merge payload." }, { status: 400 });
  }

  const { tagId } = await context.params;

  try {
    const result = await mergeTags({
      sourceTagId: tagId,
      destinationTagId: parsed.data.destinationTagId,
    });

    revalidateAdminTagPaths([tagId, result.destination.id]);

    return NextResponse.json({
      message: `Merged ${result.source.name} into ${result.destination.name}.`,
      sourceTagId: tagId,
      destinationTagId: result.destination.id,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to merge tags.",
      },
      { status: 400 },
    );
  }
}
