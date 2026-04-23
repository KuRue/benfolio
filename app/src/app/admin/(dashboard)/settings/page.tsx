import {
  updateAppSettingsAction,
  updateSiteProfileAction,
} from "@/app/admin/actions";
import { AppSettingsForm } from "@/components/admin/app-settings-form";
import { SiteProfileForm } from "@/components/admin/site-profile-form";
import { SiteProfilePhotoLibrary } from "@/components/admin/site-profile-photo-library";
import { SystemStatusPanel } from "@/components/admin/system-status-panel";
import { SiteHeader } from "@/components/public/site-header";
import { getResolvedRuntimeSettings } from "@/lib/app-settings";
import { getAdminSiteProfileData } from "@/lib/admin-data";
import { env } from "@/lib/env";
import { getSystemDiagnostics } from "@/lib/system-status";
import { buildDisplayUrl } from "@/lib/storage";

export default async function AdminSettingsPage() {
  const [{ siteProfile, libraryPhotos }, runtimeSettings, diagnostics] =
    await Promise.all([
      getAdminSiteProfileData(),
      getResolvedRuntimeSettings(),
      getSystemDiagnostics(),
    ]);

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <p className="editorial-label">Settings</p>
        <h1 className="font-serif text-3xl tracking-[-0.03em] text-white sm:text-[2.5rem]">
          Control center
        </h1>
      </section>

      <SystemStatusPanel
        initialDiagnostics={{
          checks: diagnostics.checks,
          queueCounts: diagnostics.queueCounts,
          failures: diagnostics.failures,
          lastSuccess: {
            photoProcessedAt: diagnostics.lastSuccess.photoProcessedAt?.toISOString() ?? null,
            importCompletedAt:
              diagnostics.lastSuccess.importCompletedAt?.toISOString() ?? null,
          },
          setup: diagnostics.setup,
          warnings: diagnostics.warnings,
        }}
      />

      <section className="space-y-3">
        <p className="editorial-label">Preview</p>
        <SiteHeader
          profile={siteProfile}
          showSearch={false}
          showLogoMark={runtimeSettings.logoMarkEnabled}
          cfEnabled={runtimeSettings.cfImagesEnabled}
        />
      </section>

      <SiteProfileForm
        action={updateSiteProfileAction}
        initialValues={{
          displayName: siteProfile.displayName,
          handle: siteProfile.handle ?? "",
          linkUrl: siteProfile.websiteUrl ?? siteProfile.instagramUrl ?? "",
          headline: siteProfile.headline,
          bio: siteProfile.bio,
          coverFocalX: siteProfile.coverFocalX ?? 50,
          coverFocalY: siteProfile.coverFocalY ?? 50,
        }}
        currentCoverUrl={buildDisplayUrl(siteProfile.coverDisplayKey)}
        currentLogoUrl={buildDisplayUrl(siteProfile.logoDisplayKey)}
      />

      <AppSettingsForm
        action={updateAppSettingsAction}
        initialValues={{
          storageProviderLabel: runtimeSettings.storageProviderLabel ?? "",
          storageEndpoint: runtimeSettings.storageEndpoint,
          storagePublicEndpoint: runtimeSettings.storagePublicEndpoint,
          storageRegion: runtimeSettings.storageRegion,
          storageForcePathStyle: runtimeSettings.storageForcePathStyle,
          storageOriginalsBucket: runtimeSettings.storageOriginalsBucket,
          storageDerivativesBucket: runtimeSettings.storageDerivativesBucket,
          importsPrefix: runtimeSettings.importsPrefix,
          importsCleanupMode: runtimeSettings.importsCleanupMode,
          importsArchivePrefix: runtimeSettings.importsArchivePrefix,
          publicSearchEnabled: runtimeSettings.publicSearchEnabled,
          downloadsEnabled: runtimeSettings.downloadsEnabled,
          allowPublicIndexing: runtimeSettings.allowPublicIndexing,
          defaultEventVisibility: runtimeSettings.defaultEventVisibility,
          directUploadEnabled: runtimeSettings.directUploadEnabled,
          logoMarkEnabled: runtimeSettings.logoMarkEnabled,
          cfImagesEnabled: runtimeSettings.cfImagesEnabled,
        }}
        appUrl={runtimeSettings.appUrl}
        webhookSignatureEnabled={Boolean(env.STORAGE_WEBHOOK_SECRET)}
        initialStorageSummary={{
          state: diagnostics.checks.find((check) => check.key === "storage")?.state ?? "error",
          detail: diagnostics.checks.find((check) => check.key === "storage")?.detail ?? null,
        }}
      />

      <SiteProfilePhotoLibrary
        photos={libraryPhotos.map((photo) => ({
          ...photo,
          createdAt: photo.createdAt.toISOString(),
          event: {
            title: photo.event.title,
            slug: photo.event.slug,
            eventDateLabel: photo.eventDateLabel,
          },
        }))}
      />
    </div>
  );
}
