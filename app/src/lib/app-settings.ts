import "server-only";

import type { AppSettings } from "../../../prisma/generated/client/client";
import {
  DEFAULT_RUNTIME_SETTINGS,
  resolveRuntimeSettings,
  type ResolvedRuntimeSettings,
} from "../../../prisma/runtime-settings";

import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export type AppSettingsRecord = AppSettings;
const SETTINGS_CACHE_TTL_MS = 5_000;
const globalForSettings = globalThis as typeof globalThis & {
  __galleryAppSettingsCache?: {
    record: AppSettingsRecord | null;
    expiresAt: number;
  };
};

export async function getAppSettingsRecord() {
  const now = Date.now();

  if (
    globalForSettings.__galleryAppSettingsCache &&
    globalForSettings.__galleryAppSettingsCache.expiresAt > now
  ) {
    return globalForSettings.__galleryAppSettingsCache.record;
  }

  const record = await prisma.appSettings.findUnique({
    where: {
      id: "default",
    },
  });

  globalForSettings.__galleryAppSettingsCache = {
    record,
    expiresAt: now + SETTINGS_CACHE_TTL_MS,
  };

  return record;
}

export function resolveAppRuntimeSettings(
  record?: AppSettingsRecord | null,
): ResolvedRuntimeSettings {
  return resolveRuntimeSettings({
    env: {
      appUrl: env.APP_URL,
      storageEndpoint: env.S3_ENDPOINT,
      storagePublicEndpoint: env.S3_PUBLIC_ENDPOINT,
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
}

export async function getResolvedRuntimeSettings() {
  const record = await getAppSettingsRecord();
  return resolveAppRuntimeSettings(record);
}

export function clearAppSettingsCache() {
  globalForSettings.__galleryAppSettingsCache = undefined;
}

export const defaultAppSettingsValues = {
  storageProviderLabel: "",
  storageEndpoint: "",
  storagePublicEndpoint: "",
  storageRegion: "",
  storageForcePathStyle: DEFAULT_RUNTIME_SETTINGS.storageForcePathStyle,
  storageOriginalsBucket: "",
  storageDerivativesBucket: "",
  importsPrefix: DEFAULT_RUNTIME_SETTINGS.importsPrefix,
  importsCleanupMode: DEFAULT_RUNTIME_SETTINGS.importsCleanupMode,
  importsArchivePrefix: DEFAULT_RUNTIME_SETTINGS.importsArchivePrefix,
  publicSearchEnabled: DEFAULT_RUNTIME_SETTINGS.publicSearchEnabled,
  downloadsEnabled: DEFAULT_RUNTIME_SETTINGS.downloadsEnabled,
  allowPublicIndexing: DEFAULT_RUNTIME_SETTINGS.allowPublicIndexing,
  defaultEventVisibility: DEFAULT_RUNTIME_SETTINGS.defaultEventVisibility,
  directUploadEnabled: DEFAULT_RUNTIME_SETTINGS.directUploadEnabled,
  logoMarkEnabled: DEFAULT_RUNTIME_SETTINGS.logoMarkEnabled,
} as const;
