/**
 * Cloudflare Image Transformations helper.
 *
 * When the `cfImagesEnabled` runtime setting is on, these helpers wrap
 * the existing `/i/<key>` derivative URLs in `/cdn-cgi/image/...` so
 * Cloudflare can resize, reformat, and re-encode at the edge.
 *
 * The underlying `/i/[...key]` route still serves the raw derivative
 * from R2 — Cloudflare fetches it as the transformation source, then
 * caches the transformed result for 30 days. A transformation only
 * counts against the monthly quota the first time a unique
 * (source + options) combination is requested; every subsequent
 * request is a cache hit and costs nothing.
 *
 * Prerequisites for this to work on the zone:
 *   1. The app must be reachable through Cloudflare's edge — either an
 *      orange-cloud proxied DNS record OR a cloudflared tunnel (the
 *      tunnel terminates at Cloudflare and is always proxied).
 *   2. Dashboard → the zone → Images → Transformations → "Enable for
 *      Zone". The free plan includes 5000 unique transformations per
 *      month.
 *   3. The `cfImagesEnabled` toggle in admin settings is on.
 *
 * If the toggle is off (or the caller omits `enabled`), the helpers
 * transparently fall back to the plain `/i/<key>` URL — same behaviour
 * as before.
 *
 * See https://developers.cloudflare.com/images/transform-images/
 */

export type TransformFit = "cover" | "contain" | "scale-down" | "crop" | "pad";
export type TransformFormat = "auto" | "avif" | "webp" | "jpeg" | "png";

export type TransformOptions = {
  width?: number;
  height?: number;
  quality?: number;
  /** Defaults to "auto" when CF is on — lets browsers negotiate AVIF/WebP/JPEG. */
  format?: TransformFormat;
  fit?: TransformFit;
  /**
   * Either "auto" (CF's smart crop) or a normalized focal point like
   * "0.25x0.5". Percent-style inputs (e.g. focalX=25, focalY=50) are
   * converted for you by `gravityFromFocal`.
   */
  gravity?: string;
};

function encodeKeyPath(storageKey: string): string {
  return storageKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

/**
 * Convert the percent-style focal-point columns we store on events /
 * photos into Cloudflare's `0x0`-to-`1x1` gravity notation.
 */
export function gravityFromFocal(
  focalX: number | null | undefined,
  focalY: number | null | undefined,
): string | undefined {
  if (focalX == null && focalY == null) return undefined;
  const x = Math.min(100, Math.max(0, focalX ?? 50)) / 100;
  const y = Math.min(100, Math.max(0, focalY ?? 50)) / 100;
  return `${x.toFixed(3)}x${y.toFixed(3)}`;
}

function serializeOptions(opts: TransformOptions): string {
  const pairs: string[] = [];
  if (opts.width) pairs.push(`width=${Math.round(opts.width)}`);
  if (opts.height) pairs.push(`height=${Math.round(opts.height)}`);
  if (opts.quality) pairs.push(`quality=${Math.round(opts.quality)}`);
  if (opts.fit) pairs.push(`fit=${opts.fit}`);
  if (opts.gravity) pairs.push(`gravity=${opts.gravity}`);
  // Default to format=auto so browsers get AVIF/WebP when supported.
  pairs.push(`format=${opts.format ?? "auto"}`);
  return pairs.join(",");
}

/**
 * Build a single transformed image URL, or fall back to the plain
 * derivative URL when Cloudflare transformations aren't enabled.
 *
 * `enabled` is the resolved `cfImagesEnabled` runtime setting — callers
 * read it via `getResolvedRuntimeSettings()` and thread it down.
 */
export function buildTransformedImageUrl(
  storageKey: string | null | undefined,
  enabled: boolean,
  opts: TransformOptions = {},
): string | null {
  if (!storageKey) return null;
  const path = `/i/${encodeKeyPath(storageKey)}`;
  if (!enabled) return path;
  return `/cdn-cgi/image/${serializeOptions(opts)}${path}`;
}

/**
 * Build a responsive srcset. Returns `undefined` when CF transforms
 * are disabled so the caller can drop the attribute and serve the
 * pre-generated derivative at its native size instead.
 *
 * Each width in the list is one unique transformation against the
 * monthly quota, so keep the list short (3–4 entries is usually
 * plenty). Browsers pick one entry per viewport, but the CDN caches
 * every size anyone requests.
 */
export function buildTransformedSrcSet(
  storageKey: string | null | undefined,
  enabled: boolean,
  widths: number[],
  baseOpts: Omit<TransformOptions, "width"> = {},
): string | undefined {
  if (!storageKey || !enabled || widths.length === 0) {
    return undefined;
  }
  return widths
    .map((width) => {
      const url = buildTransformedImageUrl(storageKey, enabled, {
        ...baseOpts,
        width,
      });
      return `${url} ${width}w`;
    })
    .join(", ");
}
