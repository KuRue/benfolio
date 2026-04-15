import { updateSiteProfileAction } from "@/app/admin/actions";
import { SiteProfileForm } from "@/components/admin/site-profile-form";
import { SiteProfilePhotoLibrary } from "@/components/admin/site-profile-photo-library";
import { SiteHeader } from "@/components/public/site-header";
import { getAdminSiteProfileData } from "@/lib/admin-data";

export default async function AdminSettingsPage() {
  const { siteProfile, libraryPhotos } = await getAdminSiteProfileData();

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="editorial-label">Settings</p>
        <h1 className="font-serif text-4xl tracking-[-0.03em] text-white">
          Homepage profile
        </h1>
        <p className="max-w-2xl text-sm leading-7 text-white/58">
          Control the profile header that introduces the public archive before the
          event grid.
        </p>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="editorial-label">Preview</p>
            <h2 className="mt-2 font-serif text-2xl tracking-[-0.03em] text-white">
              Public homepage header
            </h2>
          </div>
        </div>
        <SiteHeader profile={siteProfile} showSearch={false} />
      </section>

      <SiteProfileForm
        action={updateSiteProfileAction}
        initialValues={{
          displayName: siteProfile.displayName,
          handle: siteProfile.handle ?? "",
          headline: siteProfile.headline,
          bio: siteProfile.bio,
        }}
      />

      <SiteProfilePhotoLibrary
        photos={libraryPhotos.map((photo) => ({
          ...photo,
          createdAt: photo.createdAt.toISOString(),
          event: {
            ...photo.event,
            eventDate: photo.event.eventDate.toISOString(),
          },
        }))}
      />
    </div>
  );
}
