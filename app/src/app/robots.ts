import type { MetadataRoute } from "next";

import { getResolvedRuntimeSettings } from "@/lib/app-settings";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const settings = await getResolvedRuntimeSettings();

  return {
    rules: [
      settings.allowPublicIndexing
        ? {
            userAgent: "*",
            allow: "/",
            disallow: ["/admin", "/api/admin"],
          }
        : {
            userAgent: "*",
            disallow: ["/"],
          },
    ],
    sitemap: settings.allowPublicIndexing
      ? `${settings.appUrl}/sitemap.xml`
      : undefined,
  };
}
