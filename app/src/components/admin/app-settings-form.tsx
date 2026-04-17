"use client";

import { useActionState, useEffect, useState } from "react";

import type { AppSettingsActionState } from "@/app/admin/actions";

type AppSettingsFormProps = {
  action: (
    state: AppSettingsActionState,
    formData: FormData,
  ) => Promise<AppSettingsActionState>;
  initialValues: {
    storageProviderLabel: string;
    storageEndpoint: string;
    storagePublicEndpoint: string;
    storageRegion: string;
    storageForcePathStyle: boolean;
    storageOriginalsBucket: string;
    storageDerivativesBucket: string;
    importsPrefix: string;
    importsCleanupMode: "delete" | "archive";
    importsArchivePrefix: string;
    publicSearchEnabled: boolean;
    downloadsEnabled: boolean;
    allowPublicIndexing: boolean;
    defaultEventVisibility: "DRAFT" | "HIDDEN" | "PUBLIC";
    directUploadEnabled: boolean;
    logoMarkEnabled: boolean;
  };
  appUrl: string;
  webhookSignatureEnabled: boolean;
  initialStorageSummary: {
    state: "ok" | "warn" | "error";
    detail: string | null;
  };
};

const initialState: AppSettingsActionState = {};

function CheckboxField(props: {
  name: string;
  label: string;
  description: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-start gap-3 rounded-[1.15rem] border border-white/8 bg-white/[0.03] px-4 py-3">
      <input
        type="checkbox"
        name={props.name}
        defaultChecked={props.defaultChecked}
        className="mt-1 h-4 w-4 rounded border-white/16 bg-black/30 text-[#c5965c] accent-[#c5965c]"
      />
      <span className="space-y-1">
        <span className="block text-sm text-white">{props.label}</span>
        <span className="block text-sm text-white/46">{props.description}</span>
      </span>
    </label>
  );
}

export function AppSettingsForm({
  action,
  initialValues,
  appUrl,
  webhookSignatureEnabled,
  initialStorageSummary,
}: AppSettingsFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [dirty, setDirty] = useState(false);
  const [storageCheck, setStorageCheck] = useState(initialStorageSummary);
  const [storageChecking, setStorageChecking] = useState(false);

  useEffect(() => {
    if (state.success) {
      setDirty(false);
    }
  }, [state.success]);

  async function runStorageCheck() {
    setStorageChecking(true);

    try {
      const response = await fetch("/api/admin/system/diagnostics", {
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        diagnostics?: {
          checks?: Array<{
            key: string;
            state: "ok" | "warn" | "error";
            detail: string | null;
          }>;
        };
      };

      if (!response.ok || !payload.diagnostics) {
        throw new Error(payload.error ?? "Could not run diagnostics.");
      }

      const storageResult =
        payload.diagnostics.checks?.find((check) => check.key === "storage") ?? null;

      setStorageCheck({
        state: storageResult?.state ?? "error",
        detail: storageResult?.detail ?? "Storage diagnostics did not return a result.",
      });
    } catch (error) {
      setStorageCheck({
        state: "error",
        detail: error instanceof Error ? error.message : "Could not run diagnostics.",
      });
    } finally {
      setStorageChecking(false);
    }
  }

  return (
    <form
      action={formAction}
      onChangeCapture={() => setDirty(true)}
      className="admin-card space-y-5 px-5 py-5 sm:px-6 sm:py-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <p className="editorial-label">Operations</p>
          <h2 className="font-serif text-[1.8rem] tracking-[-0.03em] text-white">
            Control center
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={runStorageCheck}
            disabled={storageChecking}
            className="admin-button-muted"
          >
            {storageChecking ? "Testing storage..." : "Test storage"}
          </button>
          <button type="submit" disabled={pending} className="admin-button">
            {pending ? "Saving..." : dirty ? "Save changes" : "Saved"}
          </button>
        </div>
      </div>

      {state.success ? (
        <p className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
          {state.success}
        </p>
      ) : null}

      {state.error ? (
        <p className="rounded-2xl border border-[#c5965c]/30 bg-[#c5965c]/10 px-4 py-3 text-sm text-[#f3d1aa]">
          {state.error}
        </p>
      ) : null}

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm text-white">Storage</p>
            <p className="text-sm text-white/46">Credentials stay in env.</p>
          </div>
          <span
            className={`rounded-full border px-3 py-1 text-[0.68rem] uppercase tracking-[0.24em] ${
              storageCheck.state === "ok"
                ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
                : storageCheck.state === "warn"
                  ? "border-[#c5965c]/30 bg-[#c5965c]/10 text-[#f3d1aa]"
                  : "border-white/10 bg-white/[0.04] text-white/60"
            }`}
          >
            {storageCheck.state === "ok"
              ? "reachable"
              : storageCheck.state === "warn"
                ? "attention"
                : "unchecked"}
          </span>
        </div>
        {storageCheck.detail ? (
          <p className="text-sm text-white/48">{storageCheck.detail}</p>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <label className="block space-y-2">
            <span className="text-sm text-white/68">Provider label</span>
            <input
              name="storageProviderLabel"
              defaultValue={initialValues.storageProviderLabel}
              className="admin-input"
              placeholder="Cloudflare R2"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm text-white/68">Region</span>
            <input
              name="storageRegion"
              defaultValue={initialValues.storageRegion}
              className="admin-input"
              placeholder="auto"
            />
          </label>
          <label className="block space-y-2 lg:col-span-2">
            <span className="text-sm text-white/68">Endpoint</span>
            <input
              name="storageEndpoint"
              defaultValue={initialValues.storageEndpoint}
              className="admin-input"
              placeholder="https://<account>.r2.cloudflarestorage.com"
            />
          </label>
          <label className="block space-y-2 lg:col-span-2">
            <span className="text-sm text-white/68">Public endpoint</span>
            <input
              name="storagePublicEndpoint"
              defaultValue={initialValues.storagePublicEndpoint}
              className="admin-input"
              placeholder="Browser-facing upload endpoint"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm text-white/68">Originals bucket</span>
            <input
              name="storageOriginalsBucket"
              defaultValue={initialValues.storageOriginalsBucket}
              className="admin-input"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm text-white/68">Derivatives bucket</span>
            <input
              name="storageDerivativesBucket"
              defaultValue={initialValues.storageDerivativesBucket}
              className="admin-input"
            />
          </label>
        </div>

        <label className="flex items-center gap-3 rounded-[1.15rem] border border-white/8 bg-white/[0.03] px-4 py-3">
          <input
            type="checkbox"
            name="storageForcePathStyle"
            defaultChecked={initialValues.storageForcePathStyle}
            className="h-4 w-4 rounded border-white/16 bg-black/30 text-[#c5965c] accent-[#c5965c]"
          />
          <span className="text-sm text-white/72">Use path-style S3 requests</span>
        </label>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm text-white">Imports</p>
            <p className="text-sm text-white/46">Scan and webhook behavior.</p>
          </div>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[0.68rem] uppercase tracking-[0.24em] text-white/56">
            {webhookSignatureEnabled ? "signed webhook" : "unsigned webhook"}
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <label className="block space-y-2">
            <span className="text-sm text-white/68">Imports prefix</span>
            <input
              name="importsPrefix"
              defaultValue={initialValues.importsPrefix}
              className="admin-input"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm text-white/68">Cleanup</span>
            <select
              name="importsCleanupMode"
              defaultValue={initialValues.importsCleanupMode}
              className="admin-select"
            >
              <option value="delete">Delete after success</option>
              <option value="archive">Archive after success</option>
            </select>
          </label>
          <label className="block space-y-2 lg:col-span-2">
            <span className="text-sm text-white/68">Archive prefix</span>
            <input
              name="importsArchivePrefix"
              defaultValue={initialValues.importsArchivePrefix}
              className="admin-input"
            />
          </label>
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <p className="text-sm text-white">Gallery</p>
          <p className="text-sm text-white/46">Public behavior and defaults.</p>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <CheckboxField
            name="publicSearchEnabled"
            label="Public search"
            description="Expose the live public photo search."
            defaultChecked={initialValues.publicSearchEnabled}
          />
          <CheckboxField
            name="downloadsEnabled"
            label="Original downloads"
            description="Allow the public download endpoint."
            defaultChecked={initialValues.downloadsEnabled}
          />
          <CheckboxField
            name="allowPublicIndexing"
            label="Search indexing"
            description="Allow robots and sitemap output."
            defaultChecked={initialValues.allowPublicIndexing}
          />
          <CheckboxField
            name="directUploadEnabled"
            label="Direct uploads"
            description="Allow browser-to-storage admin uploads."
            defaultChecked={initialValues.directUploadEnabled}
          />
          <CheckboxField
            name="logoMarkEnabled"
            label="Logo mark"
            description="Show the public home mark."
            defaultChecked={initialValues.logoMarkEnabled}
          />
        </div>

        <label className="block space-y-2">
          <span className="text-sm text-white/68">Default event visibility</span>
          <select
            name="defaultEventVisibility"
            defaultValue={initialValues.defaultEventVisibility}
            className="admin-select"
          >
            <option value="DRAFT">Draft</option>
            <option value="HIDDEN">Hidden</option>
            <option value="PUBLIC">Public</option>
          </select>
        </label>
      </section>

      <section className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm text-white">System</p>
            <p className="text-sm text-white/46">Current app URL</p>
          </div>
          <code className="rounded-full border border-white/10 bg-black/24 px-3 py-1 text-xs text-white/68">
            {appUrl}
          </code>
        </div>
      </section>
    </form>
  );
}
