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
    hasSavedToken: Boolean(savedToken),
    hasEnvToken: Boolean(envToken),
  };
}

export async function updateAdminFurtrackSettings(args: {
  authToken?: string | null;
  baseUrl?: string | null;
  impersonate?: string | null;
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

  const settings = await prisma.appSettings.upsert({
    where: {
      id: "default",
    },
    create: {
      id: "default",
      furtrackAuthToken: args.clearToken || !authToken ? null : encryptSecret(authToken),
      furtrackBaseUrl: baseUrl || null,
      furtrackImpersonate: impersonate || null,
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
    },
    select: {
      furtrackAuthToken: true,
      furtrackBaseUrl: true,
      furtrackImpersonate: true,
    },
  });

  clearAppSettingsCache();

  return {
    baseUrl: settings.furtrackBaseUrl || env.FURTRACK_BASE_URL || "https://solar.furtrack.com",
    impersonate:
      settings.furtrackImpersonate || env.FURTRACK_CURL_CFFI_IMPERSONATE,
    hasSavedToken: Boolean(settings.furtrackAuthToken?.trim()),
  };
}
