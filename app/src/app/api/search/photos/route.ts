import { NextResponse } from "next/server";

import { searchPublicPhotos } from "@/lib/photo-search";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query")?.trim() ?? "";
  const limitValue = Number.parseInt(searchParams.get("limit") ?? "12", 10);

  if (!query) {
    return NextResponse.json({
      results: [],
    });
  }

  try {
    const results = await searchPublicPhotos({
      query,
      limit: Number.isFinite(limitValue) ? limitValue : 12,
    });

    return NextResponse.json({
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to search public photos.",
      },
      { status: 500 },
    );
  }
}
