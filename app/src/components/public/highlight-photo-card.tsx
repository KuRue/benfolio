import Link from "next/link";

import { BlurUpImage } from "@/components/public/blur-up-image";
import {
  buildTransformedImageUrl,
  buildTransformedSrcSet,
} from "@/lib/cf-images";
import { formatDateRange } from "@/lib/strings";

type HighlightPhotoCardProps = {
  photo: {
    id: string;
    caption: string | null;
    altText: string | null;
    originalFilename: string;
    width: number;
    height: number;
    displayKey: string | null;
    imageUrl: string | null;
    blurDataUrl: string | null;
    dominantColor: string | null;
    event: {
      title: string;
      slug: string;
      eventDate: Date;
      eventEndDate: Date | null;
    };
  };
  cfEnabled: boolean;
};

const HIGHLIGHT_WIDTHS = [420, 640, 860];
const HIGHLIGHT_SIZES = "(min-width: 1280px) 22rem, (min-width: 768px) 30vw, 88vw";

export function HighlightPhotoCard({
  photo,
  cfEnabled,
}: HighlightPhotoCardProps) {
  const transformedImage = buildTransformedImageUrl(photo.displayKey, cfEnabled, {
    fit: "cover",
    quality: 82,
    width: Math.max(...HIGHLIGHT_WIDTHS),
  });
  const srcSet = buildTransformedSrcSet(
    photo.displayKey,
    cfEnabled,
    HIGHLIGHT_WIDTHS,
    {
      fit: "cover",
      quality: 82,
    },
  );
  const imageUrl = transformedImage ?? photo.imageUrl;
  const title =
    photo.caption?.trim() ||
    `${photo.event.title} highlight`;

  return (
    <Link
      href={`/p/${photo.id}`}
      className="group relative block overflow-hidden rounded-[1.6rem] border border-white/10 bg-white/4 shadow-[0_18px_62px_rgba(0,0,0,0.28)] transition duration-300 hover:-translate-y-0.5 hover:border-white/16"
      style={{
        aspectRatio: `${photo.width} / ${photo.height}`,
      }}
    >
      {imageUrl ? (
        <BlurUpImage
          src={imageUrl}
          srcSet={srcSet}
          sizes={HIGHLIGHT_SIZES}
          alt={photo.altText ?? title}
          blurDataUrl={photo.blurDataUrl}
          dominantColor={photo.dominantColor}
          loading="lazy"
          imgClassName="brightness-[1.06] contrast-[1.03] saturate-[1.04] transition duration-700 group-hover:scale-[1.035] group-hover:brightness-[1.1] group-hover:contrast-[1.08]"
        />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-t from-black/64 via-black/8 to-transparent opacity-82 transition-opacity duration-300 group-hover:opacity-90" />
      <div className="absolute inset-x-0 bottom-0 space-y-1.5 p-4">
        <p className="text-[0.68rem] uppercase tracking-[0.24em] text-[#a097ff] [text-shadow:_0_1px_14px_rgba(0,0,0,0.8)]">
          {formatDateRange(photo.event.eventDate, photo.event.eventEndDate, "short")}
        </p>
        <h3 className="line-clamp-2 text-balance font-serif text-2xl leading-[0.98] tracking-[-0.045em] text-white [text-shadow:_0_3px_18px_rgba(0,0,0,0.65)]">
          {title}
        </h3>
      </div>
    </Link>
  );
}
