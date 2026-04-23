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
      className={`floating-action inline-flex h-[3.25rem] w-[3.25rem] items-center justify-center overflow-hidden rounded-full bg-black/38 text-white/86 transition hover:bg-white/12 hover:text-white sm:h-14 sm:w-14 ${className}`.trim()}
      aria-label="Go to homepage"
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          className="h-full w-full object-contain p-2.5 sm:p-3"
        />
      ) : (
        <span className="font-serif text-lg tracking-[-0.08em]">
          {getMonogram(displayName).slice(0, 2)}
        </span>
      )}
    </Link>
  );
}
