import "server-only";

import { cookies, headers } from "next/headers";

import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const VISITOR_COOKIE = "bf_vid";

/**
 * Hostnames we consider "our own" — referrals from these are treated as
 * internal navigation and skipped. We compare against the Referer host by
 * case-insensitive suffix match so localhost, preview deploys, and the
 * production APP_URL all count as internal even if APP_URL isn't set.
 */
function internalHosts(): string[] {
  const hosts: string[] = ["localhost", "127.0.0.1"];
  const appUrl = process.env.APP_URL;
  if (appUrl && URL.canParse(appUrl)) {
    hosts.push(new URL(appUrl).hostname.toLowerCase());
  }
  return hosts;
}

/**
 * Parse the Referer header into a safe-to-store host + landing path, or
 * null if the header is missing, malformed, or points back at our own
 * origin. The landing path is the *current* request pathname, not the
 * referrer's — it tells us where the visitor landed, not where they came
 * from. Query strings are dropped to avoid logging anything sensitive.
 */
function parseReferral(
  refererHeader: string | null | undefined,
  currentPath: string,
): { referrerHost: string; landingPath: string } | null {
  if (!refererHeader) return null;
  if (!URL.canParse(refererHeader)) return null;

  const url = new URL(refererHeader);
  const host = url.hostname.toLowerCase();
  if (!host) return null;

  const mine = internalHosts();
  if (mine.some((own) => host === own || host.endsWith(`.${own}`))) {
    return null;
  }

  // Store at most 512 chars; drop the query string so we never log PII
  // that a noisy referrer might tack on (utm params are fine to keep but
  // not worth the schema cost here).
  const landingPath = currentPath.split("?")[0]!.slice(0, 512);
  return {
    referrerHost: host.slice(0, 253),
    landingPath,
  };
}

/**
 * Read the visitor id issued by `proxy.ts`, or null if the request looks
 * like a bot / pre-cookie request. Tracking helpers no-op on null so
 * callers never have to branch.
 */
async function readVisitorId(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(VISITOR_COOKIE)?.value;
  if (!raw) return null;
  // Defensive: cap at column width. The proxy only ever writes 32 chars.
  return raw.slice(0, 64);
}

function today(): Date {
  // Normalize to UTC midnight so `day` is a stable grouping key.
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/**
 * Record that this visitor saw the site today. Fire-and-forget — never
 * throws, never blocks rendering. No-op for bots (no cookie) and admins
 * previewing their own work.
 */
export async function trackSiteVisit(): Promise<void> {
  try {
    const visitorId = await readVisitorId();
    if (!visitorId) return;

    const admin = await getCurrentAdmin();
    if (admin) return;

    const headerStore = await headers();
    const referer = headerStore.get("referer");
    // proxy.ts stamps the current pathname onto every request so RSCs
    // can read it here (Next doesn't expose the URL to server components
    // otherwise). Falls back to "/" if the proxy matcher skipped the route.
    const currentPath = headerStore.get("x-bf-path") ?? "/";
    const referral = parseReferral(referer, currentPath);

    await Promise.all([
      prisma.siteVisitorDay.upsert({
        where: {
          visitorId_day: {
            visitorId,
            day: today(),
          },
        },
        create: {
          visitorId,
          day: today(),
        },
        update: {},
      }),
      referral
        ? prisma.referralVisit.upsert({
            where: {
              visitorId_day_referrerHost: {
                visitorId,
                day: today(),
                referrerHost: referral.referrerHost,
              },
            },
            create: {
              visitorId,
              day: today(),
              referrerHost: referral.referrerHost,
              landingPath: referral.landingPath,
            },
            update: {},
          })
        : Promise.resolve(),
    ]);
  } catch (error) {
    console.error("[analytics] trackSiteVisit failed", error);
  }
}

/**
 * Record that this visitor opened `photoId` today. Idempotent within a
 * single UTC day thanks to the composite PK. Fire-and-forget.
 */
export async function trackPhotoView(photoId: string): Promise<void> {
  try {
    const visitorId = await readVisitorId();
    if (!visitorId) return;

    const admin = await getCurrentAdmin();
    if (admin) return;

    await prisma.photoView.upsert({
      where: {
        photoId_visitorId_day: {
          photoId,
          visitorId,
          day: today(),
        },
      },
      create: {
        photoId,
        visitorId,
        day: today(),
      },
      update: {},
    });
  } catch (error) {
    console.error("[analytics] trackPhotoView failed", { photoId, error });
  }
}
