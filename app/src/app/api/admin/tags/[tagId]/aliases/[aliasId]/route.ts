import { NextResponse } from "next/server";

import { removeTagAlias } from "@/lib/admin-tag-governance";
import { revalidateAdminTagPaths } from "@/lib/admin-tag-revalidation";
import { getCurrentAdmin } from "@/lib/auth";

type RouteContext = {
  params: Promise<{
    tagId: string;
    aliasId: string;
  }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { tagId, aliasId } = await context.params;

  try {
    await removeTagAlias({
      tagId,
      aliasId,
    });

    revalidateAdminTagPaths([tagId]);

    return NextResponse.json({
      message: "Alias removed.",
      tagId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to remove alias.",
      },
      { status: 400 },
    );
  }
}
