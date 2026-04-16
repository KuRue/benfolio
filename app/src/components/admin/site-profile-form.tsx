"use client";

import { useActionState } from "react";

import type { SiteProfileActionState } from "@/app/admin/actions";

type SiteProfileFormProps = {
  action: (
    state: SiteProfileActionState,
    formData: FormData,
  ) => Promise<SiteProfileActionState>;
  initialValues: {
    displayName: string;
    handle: string;
    headline: string;
    bio: string;
  };
};

const initialState: SiteProfileActionState = {};

export function SiteProfileForm({
  action,
  initialValues,
}: SiteProfileFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="admin-card space-y-6 px-6 py-6">
      <div className="space-y-2">
        <p className="editorial-label">Homepage Profile</p>
        <h2 className="font-serif text-3xl tracking-[-0.03em] text-white">
          Public header
        </h2>
        <p className="max-w-2xl text-sm text-white/58">
          Direct uploads are optional.
        </p>
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

      <div className="grid gap-4 xl:grid-cols-2">
        <label className="block space-y-2 xl:col-span-2">
          <span className="text-sm text-white/68">Display name</span>
          <input
            name="displayName"
            defaultValue={initialValues.displayName}
            className="admin-input"
            required
          />
          {state.fieldErrors?.displayName ? (
            <span className="text-xs text-[#f3d1aa]">{state.fieldErrors.displayName}</span>
          ) : null}
        </label>

        <label className="block space-y-2">
          <span className="text-sm text-white/68">Handle</span>
          <input
            name="handle"
            defaultValue={initialValues.handle}
            className="admin-input"
            placeholder="afterhours.studio"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm text-white/68">Short intro</span>
          <input
            name="headline"
            defaultValue={initialValues.headline}
            className="admin-input"
            placeholder="Event photography with a clean, modern archive."
          />
        </label>

        <label className="block space-y-2 xl:col-span-2">
          <span className="text-sm text-white/68">Bio</span>
          <textarea
            name="bio"
            defaultValue={initialValues.bio}
            className="admin-textarea"
            placeholder="Optional longer bio"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm text-white/68">Direct hero upload</span>
          <input
            name="heroImage"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="admin-input file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium file:text-black"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm text-white/68">Direct avatar upload</span>
          <input
            name="avatarImage"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="admin-input file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium file:text-black"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-white px-5 py-3 text-sm font-medium text-black disabled:opacity-60"
      >
        {pending ? "Saving..." : "Save homepage profile"}
      </button>
    </form>
  );
}
