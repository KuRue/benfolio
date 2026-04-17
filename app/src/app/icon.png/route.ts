import { type NextRequest, NextResponse } from "next/server";

import { getSiteProfile } from "@/lib/gallery";
import { getStorageBuckets, readObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  try {
    const siteProfile = await getSiteProfile();

    if (!siteProfile.logoDisplayKey) {
      return new NextResponse("Not found", { status: 404 });
    }

    const buckets = await getStorageBuckets();
    const object = await readObject({
      bucket: buckets.derivatives,
      key: siteProfile.logoDisplayKey,
    });

    return new NextResponse(object.body, {
      headers: {
        "content-type": object.contentType,
        "cache-control": "public, max-age=3600, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
