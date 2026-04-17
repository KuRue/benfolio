import type { Metadata } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import "./globals.css";

import { getSiteProfile } from "@/lib/gallery";

const bodyFont = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
});

const displayFont = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const metadataBase =
  process.env.APP_URL && URL.canParse(process.env.APP_URL)
    ? new URL(process.env.APP_URL)
    : new URL("http://localhost:3000");

// Force per-request metadata so the title and favicon always reflect the live
// SiteProfile instead of whatever value got baked at build time (which falls
// back to "Photography" when the DB isn't reachable during static prerender).
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  let siteName = "Photography";
  let headline = "";
  let hasLogo = false;

  try {
    const siteProfile = await getSiteProfile();
    siteName = siteProfile.displayName;
    headline = siteProfile.headline;
    hasLogo = Boolean(siteProfile.logoDisplayKey);
  } catch {
    // Database unavailable during static prerender (e.g. not-found page at build time).
  }

  return {
    metadataBase,
    title: {
      default: siteName,
      template: `%s | ${siteName}`,
    },
    description: headline || undefined,
    applicationName: siteName,
    icons: hasLogo
      ? {
          icon: [{ url: "/icon.png", type: "image/png" }],
          shortcut: [{ url: "/icon.png" }],
          apple: [{ url: "/icon.png" }],
        }
      : undefined,
    openGraph: {
      type: "website",
      title: siteName,
      description: headline || undefined,
    },
  };
}

export default function RootLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  modal: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${bodyFont.variable} ${displayFont.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[#050505] text-white">
        {children}
        {modal}
      </body>
    </html>
  );
}
