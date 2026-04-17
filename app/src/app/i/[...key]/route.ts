import { type NextRequest, NextResponse } from "next/server";

import { getStorageBuckets, readObject } from "@/lib/storage";

type ImageRouteProps = {
  params: Promise<{
    key: string[];
  }>;
};

export async function GET(_request: NextRequest, { params }: ImageRouteProps) {
  const { key } = await params;

  try {
    const buckets = await getStorageBuckets();
    const object = await readObject({
      bucket: buckets.derivatives,
      key: key.join("/"),
    });

    return new NextResponse(object.body, {
      headers: {
        "content-type": object.contentType,
        "cache-control":
          object.cacheControl ?? "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
