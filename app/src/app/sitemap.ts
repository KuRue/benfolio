import type { MetadataRoute } from "next";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";

  const [events, photos] = await Promise.all([
    prisma.event.findMany({
      where: {
        visibility: "PUBLIC",
      },
      select: {
        slug: true,
        updatedAt: true,
      },
    }),
    prisma.photo.findMany({
      where: {
        event: {
          visibility: "PUBLIC",
        },
      },
      select: {
        id: true,
        updatedAt: true,
      },
    }),
  ]);

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
    },
    ...events.map((event) => ({
      url: `${baseUrl}/e/${event.slug}`,
      lastModified: event.updatedAt,
    })),
    ...photos.map((photo) => ({
      url: `${baseUrl}/p/${photo.id}`,
      lastModified: photo.updatedAt,
    })),
  ];
}
