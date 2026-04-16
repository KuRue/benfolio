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
    <div className="columns-2 gap-2 sm:columns-3 sm:gap-2.5 md:columns-3 lg:columns-4 xl:columns-6 2xl:columns-7">
      {photos.map((photo) => {
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
            key={photo.id}
            href={href}
            scroll={false}
            style={{ aspectRatio: ratio }}
            className="group relative mb-2 block break-inside-avoid overflow-hidden rounded-[1.05rem] border border-white/8 bg-white/4 shadow-[0_16px_42px_rgba(0,0,0,0.18)] transition duration-300 hover:-translate-y-0.5 hover:border-white/14 hover:shadow-[0_22px_60px_rgba(0,0,0,0.24)] sm:mb-2.5"
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
      })}
    </div>
  );
}
