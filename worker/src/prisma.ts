import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../prisma/generated/client/client.ts";
import { env } from "./env.js";

export const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: env.DATABASE_URL,
  }),
});
