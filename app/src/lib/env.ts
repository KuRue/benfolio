import "server-only";

import { z } from "zod";

function emptyStringAsUndefined<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }, schema);
}

const envSchema = z.object({
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgresql://gallery:gallery@localhost:5432/gallery?schema=public"),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  AUTH_COOKIE_SECRET: z
    .string()
    .min(32)
    .default("local-development-secret-change-me-123"),
  S3_ENDPOINT: z.string().url().default("http://localhost:9000"),
  S3_PUBLIC_ENDPOINT: emptyStringAsUndefined(z.string().url().optional()),
  S3_REGION: emptyStringAsUndefined(z.string().default("auto")),
  S3_ACCESS_KEY_ID: z.string().min(1).default("minioadmin"),
  S3_SECRET_ACCESS_KEY: z.string().min(1).default("minioadmin"),
  S3_FORCE_PATH_STYLE: z
    .union([z.boolean(), z.string()])
    .default("true")
    .transform((value) => value === true || value === "true"),
  S3_BUCKET_ORIGINALS: z.string().min(1).default("gallery-originals"),
  S3_BUCKET_DERIVATIVES: z.string().min(1).default("gallery-derivatives"),
  IMPORTS_PREFIX: emptyStringAsUndefined(z.string().min(1).default("imports/")),
  IMPORTS_CLEANUP_MODE: emptyStringAsUndefined(
    z.enum(["delete", "archive"]).default("delete"),
  ),
  IMPORTS_ARCHIVE_PREFIX: emptyStringAsUndefined(
    z.string().min(1).default("processed-imports/"),
  ),
  STORAGE_WEBHOOK_SECRET: emptyStringAsUndefined(z.string().min(1).optional()),
  STORAGE_WEBHOOK_SIGNATURE_HEADER: emptyStringAsUndefined(
    z.string().min(1).default("x-storage-webhook-signature"),
  ),
});

export const env = envSchema.parse({
  APP_URL: process.env.APP_URL,
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,
  AUTH_COOKIE_SECRET: process.env.AUTH_COOKIE_SECRET,
  S3_ENDPOINT: process.env.S3_ENDPOINT,
  S3_PUBLIC_ENDPOINT: process.env.S3_PUBLIC_ENDPOINT,
  S3_REGION: process.env.S3_REGION,
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
  S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE,
  S3_BUCKET_ORIGINALS: process.env.S3_BUCKET_ORIGINALS,
  S3_BUCKET_DERIVATIVES: process.env.S3_BUCKET_DERIVATIVES,
  IMPORTS_PREFIX: process.env.IMPORTS_PREFIX,
  IMPORTS_CLEANUP_MODE: process.env.IMPORTS_CLEANUP_MODE,
  IMPORTS_ARCHIVE_PREFIX: process.env.IMPORTS_ARCHIVE_PREFIX,
  STORAGE_WEBHOOK_SECRET: process.env.STORAGE_WEBHOOK_SECRET,
  STORAGE_WEBHOOK_SIGNATURE_HEADER: process.env.STORAGE_WEBHOOK_SIGNATURE_HEADER,
});
