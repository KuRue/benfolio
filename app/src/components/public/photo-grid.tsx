"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import Link from "next/link";

type Photo = {
  id: string;
  title: string | null;
  altText: string | null;
  caption: string | null;
  gridImageUrl: string | null;
  gridWidth: number;
  gridHeight: number;
};

type PhotoGridProps = {
  photos: Photo[];
  returnHref?: string;
};

const BREAKPOINTS: Array<{ minWidth: number; cols: number }> = [
  { minWidth: 1536, cols: 7 },
  { minWidth: 1280, cols: 6 },
  { minWidth: 1024, cols: 4 },
  { minWidth: 768, cols: 3 },
  { minWidth: 640, cols: 3 },
  { minWidth: 0, cols: 2 },
];

function getColumnCount(width: number): number {
  for (const bp of BREAKPOINTS) {
    if (width >= bp.minWidth) {
      return bp.cols;
    }
  }
  return 2;
}

export function PhotoGrid({ photos, returnHref }: PhotoGridProps) {
  // Start at mobile baseline so SSR + first client render match. The effect
  // below upgrades to the real column count once we can read viewport width.
  const [cols, setCols] = useState(2);

  useEffect(() => {
    const update = () => setCols(getColumnCount(window.innerWidth));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Round-robin into columns so the visual row order matches photo order:
  // photo i lands in column (i mod cols), giving row-major reading across
  // variable heights.
  const columns: Photo[][] = Array.from({ length: cols }, () => []);
  photos.forEach((photo, index) => {
    columns[index % cols].push(photo);
  });

  return (
    <div className="flex gap-2 sm:gap-2.5">
      {columns.map((column, columnIndex) => (
        <div
          key={columnIndex}
          className="flex min-w-0 flex-1 flex-col gap-2 sm:gap-2.5"
        >
          {column.map((photo) => (
            <PhotoTile key={photo.id} photo={photo} returnHref={returnHref} />
          ))}
        </div>
      ))}
    </div>
  );
}

function PhotoTile({
  photo,
  returnHref,
}: {
  photo: Photo;
  returnHref?: string;
}) {
  const href = returnHref
    ? {
        pathname: `/p/${photo.id}`,
        query: {
          from: returnHref,
        },
      }
    : `/p/${photo.id}`;

  const ratio =
    photo.gridWidth > 0 && photo.gridHeight > 0
      ? `${photo.gridWidth} / ${photo.gridHeight}`
      : "4 / 5";

  return (
    <Link
      href={href}
      scroll={false}
      style={{ aspectRatio: ratio }}
      className="group relative block overflow-hidden rounded-[1.05rem] border border-white/8 bg-white/4 shadow-[0_16px_42px_rgba(0,0,0,0.18)] transition duration-300 hover:-translate-y-0.5 hover:border-white/14 hover:shadow-[0_22px_60px_rgba(0,0,0,0.24)]"
    >
      <div className="relative h-full w-full overflow-hidden bg-[#0c0c0c]">
        {photo.gridImageUrl ? (
          <img
            src={photo.gridImageUrl}
            alt={photo.altText ?? photo.title ?? photo.caption ?? "Event photograph"}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.025] group-hover:saturate-[1.03]"
          />
        ) : (
          <div className="absolute inset-0 bg-[linear-gradient(145deg,_rgba(255,255,255,0.06),_rgba(255,255,255,0.02))]" />
        )}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_40%,_rgba(0,0,0,0.16)_100%)] opacity-80 transition-opacity duration-300 group-hover:opacity-100" />
        <div className="absolute inset-0 ring-1 ring-inset ring-white/0 transition duration-300 group-hover:ring-white/12" />
      </div>
    </Link>
  );
}
