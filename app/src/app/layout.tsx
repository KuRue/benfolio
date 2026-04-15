import type { Metadata } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import "./globals.css";

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

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: "Photography",
    template: "%s | Photography",
  },
  description:
    "A dark-forward event photography archive with private downloads and an editorial public presentation.",
  applicationName: "Photography Gallery",
  openGraph: {
    type: "website",
    title: "Photography",
    description:
      "A dark-forward event photography archive with private downloads and an editorial public presentation.",
  },
};

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
