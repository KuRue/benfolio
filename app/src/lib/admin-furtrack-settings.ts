import "server-only";

import { clearAppSettingsCache, getAppSettingsRecord } from "@/lib/app-settings";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/secret-box";

export async function getAdminFurtrackSettings() {
  const record = await getAppSettingsRecord();
  const savedToken = decryptSecret(record?.furtrackAuthToken)?.trim() || null;
  const envToken = env.FURTRACK_AUTH_TOKEN ?? env.FURTRACK_API_KEY ?? null;

  return {
    baseUrl:
      record?.furtrackBaseUrl?.trim() || env.FURTRACK_BASE_URL || "https://solar.furtrack.com",
    impersonate:
      record?.furtrackImpersonate?.trim() || env.FURTRACK_CURL_CFFI_IMPERSONATE,
    photographerHandle: record?.furtrackPhotographerHandle?.trim() || null,
    hasSavedToken: Boolean(savedToken),
    hasEnvToken: Boolean(envToken),
  };
}

export async function updateAdminFurtrackSettings(args: {
  authToken?: string | null;
  baseUrl?: string | null;
  impersonate?: string | null;
  photographerHandle?: string | null;
  clearToken?: boolean;
}) {
  // Tolerate users pasting the token with a leading "Bearer " or surrounding
  // quotes — store just the JWT so the Authorization header stays clean.
  const authToken = args.authToken
    ?.trim()
    .replace(/^bearer\s+/i, "")
    .replace(/^["']|["']$/g, "")
    .trim();
  const baseUrl = args.baseUrl?.trim();
  const impersonate = args.impersonate?.trim();
  // Strip a leading "3:" if the user pasted the full tag form, plus any
  // surrounding @ that handle inputs sometimes carry.
  const photographerHandle = args.photographerHandle
    ?.trim()
    .replace(/^@/, "")
    .replace(/^3:/i, "")
    .trim();

  const settings = await prisma.appSettings.upsert({
    where: {
      id: "default",
    },
    create: {
      id: "default",
      furtrackAuthToken: args.clearToken || !authToken ? null : encryptSecret(authToken),
      furtrackBaseUrl: baseUrl || null,
      furtrackImpersonate: impersonate || null,
      furtrackPhotographerHandle: photographerHandle || null,
    },
    update: {
      ...(args.clearToken
        ? {
            furtrackAuthToken: null,
          }
        : authToken
          ? {
              furtrackAuthToken: encryptSecret(authToken),
            }
          : {}),
      furtrackBaseUrl: baseUrl || null,
      furtrackImpersonate: impersonate || null,
      furtrackPhotographerHandle: photographerHandle || null,
    },
    select: {
      furtrackAuthToken: true,
      furtrackBaseUrl: true,
      furtrackImpersonate: true,
      furtrackPhotographerHandle: true,
    },
  });

  clearAppSettingsCache();

  return {
    baseUrl: settings.furtrackBaseUrl || env.FURTRACK_BASE_URL || "https://solar.furtrack.com",
    impersonate:
      settings.furtrackImpersonate || env.FURTRACK_CURL_CFFI_IMPERSONATE,
    photographerHandle: settings.furtrackPhotographerHandle?.trim() || null,
    hasSavedToken: Boolean(settings.furtrackAuthToken?.trim()),
  };
}
