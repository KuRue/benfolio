import {
  resolveRuntimeSettings,
  type ResolvedRuntimeSettings,
} from "../../prisma/runtime-settings.ts";
import { env } from "./env.js";
import { prisma } from "./prisma.js";

let cachedSettings: {
  value: ResolvedRuntimeSettings;
  expiresAt: number;
} | null = null;

const SETTINGS_CACHE_TTL_MS = 5_000;

export async function getResolvedRuntimeSettings() {
  const now = Date.now();

  if (cachedSettings && cachedSettings.expiresAt > now) {
    return cachedSettings.value;
  }

  const record = await prisma.appSettings.findUnique({
    where: {
      id: "default",
    },
  });

  const value = resolveRuntimeSettings({
    env: {
      storageEndpoint: env.S3_ENDPOINT,
      storagePublicEndpoint: env.S3_ENDPOINT,
      storageRegion: env.S3_REGION,
      storageForcePathStyle: env.S3_FORCE_PATH_STYLE,
      storageOriginalsBucket: env.S3_BUCKET_ORIGINALS,
      storageDerivativesBucket: env.S3_BUCKET_DERIVATIVES,
      importsPrefix: env.IMPORTS_PREFIX,
      importsCleanupMode: env.IMPORTS_CLEANUP_MODE,
      importsArchivePrefix: env.IMPORTS_ARCHIVE_PREFIX,
    },
    record,
  });

  cachedSettings = {
    value,
    expiresAt: now + SETTINGS_CACHE_TTL_MS,
  };

  return value;
}

export function clearResolvedRuntimeSettingsCache() {
  cachedSettings = null;
}
