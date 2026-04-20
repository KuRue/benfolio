import { NextResponse, type NextRequest } from "next/server";

/**
 * Anonymous visitor cookie used for per-day view de-duplication in the
 * admin analytics. Random 128-bit UUID; no PII, first-party, HttpOnly.
 * Matches the column length on `PhotoView.visitorId` and
 * `SiteVisitorDay.visitorId` (VARCHAR(64)).
 */
const VISITOR_COOKIE = "bf_vid";
const VISITOR_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

// Skip issuing a visitor cookie for these obvious bot/agent substrings so
// link unfurls (Discord, X, iMessage, Slack, etc.) and search crawlers
// don't show up as "visitors" in the analytics. Case-insensitive match.
const BOT_UA_SUBSTRINGS = [
  "bot",
  "crawler",
  "spider",
  "facebookexternalhit",
  "facebot",
  "twitterbot",
  "discordbot",
  "slackbot",
  "whatsapp",
  "telegrambot",
  "linkedinbot",
  "pinterest",
  "redditbot",
  "embedly",
  "quora link preview",
  "applebot",
  "yahoo",
  "yandex",
  "baiduspider",
  "duckduckbot",
  "ia_archiver",
  "ahrefssiteaudit",
  "semrushbot",
  "mj12bot",
  "python-requests",
  "curl/",
  "wget",
  "httpclient",
  "go-http-client",
  "headlesschrome",
];

function looksLikeBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true; // no UA at all → treat as bot
  const ua = userAgent.toLowerCase();
  return BOT_UA_SUBSTRINGS.some((needle) => ua.includes(needle));
}

function generateVisitorId(): string {
  // Node runtime in Next 16 proxy has globalThis.crypto.
  return crypto.randomUUID().replace(/-/g, "");
}

export function proxy(request: NextRequest) {
  // Stamp the current pathname onto the request headers so server
  // components can read it (Next doesn't expose the current URL to RSCs
  // any other way). Analytics uses this to record the *landing path* a
  // referred visitor hit. Stripped to pathname — no query string.
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set("x-bf-path", request.nextUrl.pathname);

  const response = NextResponse.next({
    request: { headers: forwardedHeaders },
  });

  // Only issue cookies to likely-human GET requests on public pages. The
  // matcher below already excludes api/_next/static, but we also skip the
  // admin surface because admin views are excluded from analytics anyway.
  if (request.method !== "GET") return response;
  if (request.nextUrl.pathname.startsWith("/admin")) return response;

  const userAgent = request.headers.get("user-agent");
  if (looksLikeBot(userAgent)) return response;

  const existing = request.cookies.get(VISITOR_COOKIE);
  if (existing?.value) return response;

  const secure = request.nextUrl.protocol === "https:";
  response.cookies.set({
    name: VISITOR_COOKIE,
    value: generateVisitorId(),
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge: VISITOR_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });

  return response;
}

export const config = {
  // Run for every page route, skip static / API / image proxy / OG routes.
  // The OG card routes are excluded because link unfurlers hit them but we
  // already filter those by UA anyway; skipping here avoids a wasted Set-Cookie.
  matcher: [
    "/((?!api|_next|i/|favicon\\.ico|icon\\.png|robots\\.txt|sitemap\\.xml|opengraph-image|twitter-image).*)",
  ],
};
