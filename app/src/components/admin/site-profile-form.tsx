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
    coverFocalX: number;
    coverFocalY: number;
  };
};

const initialState: SiteProfileActionState = {};

export function SiteProfileForm({
  action,
  initialValues,
}: SiteProfileFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="admin-card space-y-5 px-5 py-5 sm:px-6 sm:py-6">
      <div className="space-y-1.5">
        <p className="editorial-label">Homepage Profile</p>
        <h2 className="font-serif text-[2rem] tracking-[-0.03em] text-white">
          Public header
        </h2>
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
            placeholder="One short line."
          />
        </label>

        <label className="block space-y-2 xl:col-span-2">
          <span className="text-sm text-white/68">Bio fallback</span>
          <textarea
            name="bio"
            defaultValue={initialValues.bio}
            className="admin-textarea"
            placeholder="Used if the short intro is blank."
          />
        </label>

        <div className="grid gap-4 rounded-[1.2rem] border border-white/8 bg-white/[0.03] px-4 py-4 xl:col-span-2 sm:grid-cols-2">
          <label className="block space-y-2">
            <span className="text-sm text-white/68">Banner focus X</span>
            <input
              name="coverFocalX"
              type="range"
              min="0"
              max="100"
              defaultValue={initialValues.coverFocalX}
              className="w-full accent-white"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm text-white/68">Banner focus Y</span>
            <input
              name="coverFocalY"
              type="range"
              min="0"
              max="100"
              defaultValue={initialValues.coverFocalY}
              className="w-full accent-white"
            />
          </label>
        </div>

        <label className="block space-y-2">
          <span className="text-sm text-white/68">Upload banner</span>
          <input
            name="heroImage"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="admin-input file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium file:text-black"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm text-white/68">Upload avatar</span>
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
        {pending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
