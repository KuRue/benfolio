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

const HIGHLIGHT_WIDTHS = [420, 640, 860, 1200];
const HIGHLIGHT_SIZES = "(min-width: 1280px) 22rem, (min-width: 768px) 30vw, 88vw";
const WIDE_HIGHLIGHT_SIZES = "(min-width: 1280px) 44rem, (min-width: 768px) 60vw, 100vw";

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
    photo.event.title;
  const ratio = photo.height > 0 ? photo.width / photo.height : 1;
  const isLandscape = ratio >= 1.18;
  const tileClassName = isLandscape
    ? "col-span-2 row-span-2"
    : ratio >= 0.82
      ? "row-span-2"
      : "row-span-3";

  return (
    <Link
      href={{
        pathname: `/p/${photo.id}`,
        query: {
          context: "highlights",
          from: "/?section=highlights",
        },
      }}
      scroll={false}
      className={`group relative block h-full min-h-0 overflow-hidden rounded-[1.6rem] border border-white/10 bg-white/4 shadow-[0_18px_62px_rgba(0,0,0,0.28)] transition duration-300 hover:-translate-y-0.5 hover:border-white/16 ${tileClassName}`}
    >
      {imageUrl ? (
        <BlurUpImage
          src={imageUrl}
          srcSet={srcSet}
          sizes={isLandscape ? WIDE_HIGHLIGHT_SIZES : HIGHLIGHT_SIZES}
          alt={photo.altText ?? title}
          blurDataUrl={photo.blurDataUrl}
          dominantColor={photo.dominantColor}
          loading="lazy"
          imgClassName="brightness-[1.06] contrast-[1.03] saturate-[1.04] transition duration-700 group-hover:scale-[1.035] group-hover:brightness-[1.1] group-hover:contrast-[1.08]"
        />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-t from-black/68 via-black/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-90 group-focus-visible:opacity-90 group-active:opacity-90" />
      <div className="absolute inset-x-0 bottom-0 space-y-1.5 p-4 pb-5 opacity-0 transition-[opacity,transform] duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 group-active:translate-y-0 group-active:opacity-100 [@media(hover:hover)]:translate-y-2">
        <p className="text-[0.68rem] uppercase tracking-[0.24em] text-[#a097ff] [text-shadow:_0_1px_14px_rgba(0,0,0,0.8)]">
          {formatDateRange(photo.event.eventDate, photo.event.eventEndDate, "short")}
        </p>
        <h3 className="line-clamp-2 pb-1 text-balance font-serif text-2xl leading-[1.14] tracking-normal text-white [text-shadow:_0_3px_18px_rgba(0,0,0,0.65)]">
          {title}
        </h3>
      </div>
    </Link>
  );
}
