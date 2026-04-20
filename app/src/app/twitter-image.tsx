import {
  HOMEPAGE_OG_ALT,
  HOMEPAGE_OG_CONTENT_TYPE,
  HOMEPAGE_OG_SIZE,
  generateHomepageOgImage,
} from "@/lib/og-image";

export const alt = HOMEPAGE_OG_ALT;
export const size = HOMEPAGE_OG_SIZE;
export const contentType = HOMEPAGE_OG_CONTENT_TYPE;

export const dynamic = "force-dynamic";

export default function Image() {
  return generateHomepageOgImage();
}
