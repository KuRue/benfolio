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
};

export function PhotoGrid({ photos }: PhotoGridProps) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {photos.map((photo) => {
        const aspectRatio = `${photo.gridWidth} / ${photo.gridHeight}`;

        return (
          <Link
            key={photo.id}
            href={`/p/${photo.id}`}
            scroll={false}
            className="group relative overflow-hidden rounded-[1.2rem] border border-white/8 bg-white/4 shadow-[0_16px_42px_rgba(0,0,0,0.18)] transition duration-300 hover:-translate-y-0.5 hover:border-white/14 hover:shadow-[0_22px_60px_rgba(0,0,0,0.24)]"
          >
            <div
              className="relative w-full overflow-hidden bg-[#0c0c0c]"
              style={{ aspectRatio }}
            >
              {photo.gridImageUrl ? (
                <img
                  src={photo.gridImageUrl}
                  alt={photo.altText ?? photo.title ?? photo.caption ?? "Event photograph"}
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02] group-hover:saturate-[1.03]"
                />
              ) : (
                <div className="absolute inset-0 bg-[linear-gradient(145deg,_rgba(255,255,255,0.06),_rgba(255,255,255,0.02))]" />
              )}
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_34%,_rgba(0,0,0,0.18)_100%)] opacity-70 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/44 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
