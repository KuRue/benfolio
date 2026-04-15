import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../../prisma/generated/client/client";
import { env } from "@/lib/env";

const globalForPrisma = globalThis as typeof globalThis & {
  __galleryPrisma?: PrismaClient;
};

function createPrismaClient() {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: env.DATABASE_URL,
    }),
  });
}

export const prisma = globalForPrisma.__galleryPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__galleryPrisma = prisma;
}
