import { updateSiteProfileAction } from "@/app/admin/actions";
import { SiteProfileForm } from "@/components/admin/site-profile-form";
import { SiteProfilePhotoLibrary } from "@/components/admin/site-profile-photo-library";
import { SiteHeader } from "@/components/public/site-header";
import { getAdminSiteProfileData } from "@/lib/admin-data";

export default async function AdminSettingsPage() {
  const { siteProfile, libraryPhotos } = await getAdminSiteProfileData();

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <p className="editorial-label">Settings</p>
        <h1 className="font-serif text-3xl tracking-[-0.03em] text-white sm:text-[2.5rem]">
          Homepage profile
        </h1>
      </section>

      <section className="space-y-3">
        <p className="editorial-label">Preview</p>
        <SiteHeader profile={siteProfile} showSearch={false} />
      </section>

      <SiteProfileForm
        action={updateSiteProfileAction}
        initialValues={{
          displayName: siteProfile.displayName,
          handle: siteProfile.handle ?? "",
          headline: siteProfile.headline,
          bio: siteProfile.bio,
          coverFocalX: siteProfile.coverFocalX ?? 50,
          coverFocalY: siteProfile.coverFocalY ?? 50,
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
