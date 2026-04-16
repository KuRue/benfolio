/* eslint-disable @next/next/no-img-element */
import Link from "next/link";

import { getMonogram } from "@/lib/strings";
import { buildDisplayUrl } from "@/lib/storage";

type PublicSiteMarkProps = {
  displayName: string;
  logoDisplayKey: string | null;
  className?: string;
};

export function PublicSiteMark({
  displayName,
  logoDisplayKey,
  className = "",
}: PublicSiteMarkProps) {
  const logoUrl = buildDisplayUrl(logoDisplayKey);

  return (
    <Link
      href="/"
      className={`floating-action inline-flex h-11 w-11 items-center justify-center overflow-hidden rounded-[1.1rem] text-white/82 transition hover:bg-white/12 hover:text-white sm:h-12 sm:w-12 ${className}`.trim()}
      aria-label="Go to homepage"
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          className="h-full w-full object-contain p-1.5 sm:p-2"
        />
      ) : (
        <span className="font-serif text-base tracking-[-0.08em]">
          {getMonogram(displayName).slice(0, 2)}
        </span>
      )}
    </Link>
  );
}
