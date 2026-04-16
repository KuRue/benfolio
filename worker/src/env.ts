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
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgresql://gallery:gallery@localhost:5432/gallery?schema=public"),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: emptyStringAsUndefined(z.string().default("auto")),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .union([z.boolean(), z.string()])
    .transform((value) => value === true || value === "true"),
  S3_BUCKET_ORIGINALS: z.string().min(1),
  S3_BUCKET_DERIVATIVES: z.string().min(1),
  IMPORTS_PREFIX: emptyStringAsUndefined(z.string().min(1).default("imports/")),
  IMPORTS_CLEANUP_MODE: emptyStringAsUndefined(
    z.enum(["delete", "archive"]).default("delete"),
  ),
  IMPORTS_ARCHIVE_PREFIX: emptyStringAsUndefined(
    z.string().min(1).default("processed-imports/"),
  ),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,
  S3_ENDPOINT: process.env.S3_ENDPOINT,
  S3_REGION: process.env.S3_REGION,
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
  S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE,
  S3_BUCKET_ORIGINALS: process.env.S3_BUCKET_ORIGINALS,
  S3_BUCKET_DERIVATIVES: process.env.S3_BUCKET_DERIVATIVES,
  IMPORTS_PREFIX: process.env.IMPORTS_PREFIX,
  IMPORTS_CLEANUP_MODE: process.env.IMPORTS_CLEANUP_MODE,
  IMPORTS_ARCHIVE_PREFIX: process.env.IMPORTS_ARCHIVE_PREFIX,
});
