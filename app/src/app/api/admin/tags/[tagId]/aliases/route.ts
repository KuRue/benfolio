import { NextResponse } from "next/server";
import { z } from "zod";

import { addTagAlias } from "@/lib/admin-tag-governance";
import { revalidateAdminTagPaths } from "@/lib/admin-tag-revalidation";
import { getCurrentAdmin } from "@/lib/auth";

const addAliasSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).optional().nullable(),
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

  const parsed = addAliasSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid alias payload." }, { status: 400 });
  }

  const { tagId } = await context.params;

  try {
    await addTagAlias({
      tagId,
      name: parsed.data.name,
      slug: parsed.data.slug ?? undefined,
    });

    revalidateAdminTagPaths([tagId]);

    return NextResponse.json({
      message: "Alias added.",
      tagId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to add alias.",
      },
      { status: 400 },
    );
  }
}
