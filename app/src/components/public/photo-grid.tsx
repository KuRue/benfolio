/* eslint-disable @next/next/no-img-element */
import Link from "next/link";

type PhotoGridProps = {
  photos: Array<{
    id: string;
    title: string | null;
    altText: string | null;
    caption: string | null;
    gridImageUrl: string | null;
    gridWidth: number;
    gridHeight: number;
  }>;
  returnHref?: string;
};

export function PhotoGrid({ photos, returnHref }: PhotoGridProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 2xl:grid-cols-8">
      {photos.map((photo) => {
        const aspectRatio = `${photo.gridWidth} / ${photo.gridHeight}`;
        const href = returnHref
          ? {
              pathname: `/p/${photo.id}`,
              query: {
                from: returnHref,
              },
            }
          : `/p/${photo.id}`;

        return (
          <Link
            key={photo.id}
            href={href}
            scroll={false}
            className="group relative overflow-hidden rounded-[1.05rem] border border-white/8 bg-white/4 shadow-[0_16px_42px_rgba(0,0,0,0.18)] transition duration-300 hover:-translate-y-0.5 hover:border-white/14 hover:shadow-[0_22px_60px_rgba(0,0,0,0.24)]"
          >
            <div
              className="relative w-full overflow-hidden bg-[#0c0c0c]"
              style={{ aspectRatio }}
            >
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
      })}
    </div>
  );
}
