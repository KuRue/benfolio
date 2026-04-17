import { randomBytes, scryptSync } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/client/client";

const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://gallery:gallery@localhost:5432/gallery?schema=public",
});

const prisma = new PrismaClient({ adapter });

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

async function main() {
  await prisma.siteProfile.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
    },
  });

  await prisma.appSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
    },
  });

  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD?.trim();
  const displayName = process.env.SEED_ADMIN_NAME?.trim() || "Studio Admin";

  if (email && password) {
    await prisma.adminUser.upsert({
      where: { email },
      update: {
        displayName,
      },
      create: {
        email,
        displayName,
        passwordHash: hashPassword(password),
      },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
