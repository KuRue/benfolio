"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useState } from "react";

type BlurUpImageProps = {
  src: string;
  alt: string;
  /** Low-res base64 placeholder generated alongside the derivative. */
  blurDataUrl?: string | null;
  /** Tint shown under the blur while the LQIP itself is decoding. */
  dominantColor?: string | null;
  /** Applied to both images so the cover crop matches the focal point. */
  objectPosition?: string;
  /** Extra classes for the full-size <img> — e.g. hover scale effects. */
  imgClassName?: string;
  /** Extra classes on the outer wrapper (positioning, rounding, etc). */
  className?: string;
  loading?: "eager" | "lazy";
};

/**
 * Server-rendered cover with a blurred low-res placeholder that fades out
 * once the real image decodes. Mirrors the pattern PhotoGrid uses for
 * gallery tiles, so covers no longer flash a white/empty box on load.
 */
export function BlurUpImage({
  src,
  alt,
  blurDataUrl,
  dominantColor,
  objectPosition,
  imgClassName,
  className,
  loading = "eager",
}: BlurUpImageProps) {
  const [loaded, setLoaded] = useState(false);

  // If the browser served the image from cache the onLoad event may have
  // already fired before React attached — check `.complete` on the ref.
  const handleRef = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete && node.naturalWidth > 0) {
      setLoaded(true);
    }
  }, []);

  const positionStyle = objectPosition ? { objectPosition } : undefined;

  return (
    // `isolate` pins any future z-index uses inside this wrapper to its own
    // stacking context, so we never leak above a parent's overlays again.
    <div
      className={`relative isolate h-full w-full overflow-hidden ${className ?? ""}`}
      style={{ backgroundColor: dominantColor ?? undefined }}
    >
      {blurDataUrl ? (
        <img
          src={blurDataUrl}
          alt=""
          aria-hidden
          className={`absolute inset-0 h-full w-full object-cover blur-xl transition-opacity duration-500 ${
            loaded ? "opacity-0" : "opacity-100"
          }`}
          style={positionStyle}
        />
      ) : null}
      {/* Main image is absolute (not relative+z-10) so DOM order alone
          stacks it above the blur placeholder — no z-index leaking out
          of this component into a parent with its own overlays. */}
      <img
        src={src}
        alt={alt}
        ref={handleRef}
        loading={loading}
        onLoad={() => setLoaded(true)}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
          loaded ? "opacity-100" : "opacity-0"
        } ${imgClassName ?? ""}`}
        style={positionStyle}
      />
    </div>
  );
}
