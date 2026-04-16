import { NextResponse } from "next/server";

import { getCurrentAdmin } from "@/lib/auth";
import { searchAdminTags } from "@/lib/admin-tags";
import type { TagCategoryValue } from "@/lib/tags";

function asTagCategory(value: string | null): TagCategoryValue | null {
  if (
    value === "CHARACTER" ||
    value === "EVENT" ||
    value === "SPECIES" ||
    value === "MAKER" ||
    value === "GENERAL"
  ) {
    return value;
  }

  return null;
}

export async function GET(request: Request) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const category = asTagCategory(searchParams.get("category"));
  const limitValue = Number.parseInt(searchParams.get("limit") ?? "12", 10);
  const excludeTagId = searchParams.get("excludeTagId");

  const tags = await searchAdminTags({
    query,
    category,
    limit: Number.isFinite(limitValue) ? limitValue : 12,
    excludeTagId,
  });

  return NextResponse.json({
    tags: tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
      category: tag.category,
      photoCount: tag.photoCount,
      aliasCount: tag.aliasCount,
      matchedAliases: tag.matchedAliases,
    })),
  });
}
