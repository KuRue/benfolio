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
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {photos.map((photo) => {
        const aspectRatio = `${photo.gridWidth} / ${photo.gridHeight}`;

        return (
          <Link
            key={photo.id}
            href={`/p/${photo.id}`}
            scroll={false}
            className="group relative overflow-hidden rounded-[1.35rem] border border-white/8 bg-white/4"
          >
            <div
              className="relative w-full overflow-hidden bg-[#0c0c0c]"
              style={{ aspectRatio }}
            >
              {photo.gridImageUrl ? (
                <img
                  src={photo.gridImageUrl}
                  alt={photo.altText ?? photo.title ?? photo.caption ?? "Event photograph"}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                />
              ) : (
                <div className="absolute inset-0 bg-[linear-gradient(145deg,_rgba(255,255,255,0.06),_rgba(255,255,255,0.02))]" />
              )}
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
