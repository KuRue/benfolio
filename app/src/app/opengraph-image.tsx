import {
  HOMEPAGE_OG_ALT,
  HOMEPAGE_OG_CONTENT_TYPE,
  HOMEPAGE_OG_SIZE,
  generateHomepageOgImage,
} from "@/lib/og-image";

export const alt = HOMEPAGE_OG_ALT;
export const size = HOMEPAGE_OG_SIZE;
export const contentType = HOMEPAGE_OG_CONTENT_TYPE;

// Regenerate every request so the collage reflects the current set of public
// events. revalidatePath("/") already fires on public event changes, but the
// OG image route is a separate cached handler and force-dynamic is the
// simplest way to keep it in sync.
export const dynamic = "force-dynamic";

export default function Image() {
  return generateHomepageOgImage();
}
