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
  AUTH_COOKIE_SECRET: z
    .string()
    .min(32)
    .default("local-development-secret-change-me-123"),
  S3_ENDPOINT: z.string().url().default("http://localhost:9000"),
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
  FURTRACK_AUTH_TOKEN: emptyStringAsUndefined(z.string().min(1).optional()),
  FURTRACK_API_KEY: emptyStringAsUndefined(z.string().min(1).optional()),
  FURTRACK_BASE_URL: emptyStringAsUndefined(
    z.string().url().default("https://solar.furtrack.com"),
  ),
  FURTRACK_FETCH_MODE: emptyStringAsUndefined(
    z.enum(["auto", "curl_cffi", "node"]).default("curl_cffi"),
  ),
  FURTRACK_CURL_CFFI_COMMAND: emptyStringAsUndefined(
    z.string().min(1).default("python3"),
  ),
  FURTRACK_CURL_CFFI_SCRIPT: emptyStringAsUndefined(
    z.string().min(1).default("scripts/furtrack_fetch.py"),
  ),
  FURTRACK_CURL_CFFI_IMPERSONATE: emptyStringAsUndefined(
    z.string().min(1).default("chrome"),
  ),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,
  AUTH_COOKIE_SECRET: process.env.AUTH_COOKIE_SECRET,
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
  FURTRACK_AUTH_TOKEN: process.env.FURTRACK_AUTH_TOKEN,
  FURTRACK_API_KEY: process.env.FURTRACK_API_KEY,
  FURTRACK_BASE_URL: process.env.FURTRACK_BASE_URL,
  FURTRACK_FETCH_MODE: process.env.FURTRACK_FETCH_MODE,
  FURTRACK_CURL_CFFI_COMMAND: process.env.FURTRACK_CURL_CFFI_COMMAND,
  FURTRACK_CURL_CFFI_SCRIPT: process.env.FURTRACK_CURL_CFFI_SCRIPT,
  FURTRACK_CURL_CFFI_IMPERSONATE: process.env.FURTRACK_CURL_CFFI_IMPERSONATE,
});
