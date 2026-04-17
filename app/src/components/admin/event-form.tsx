"use client";

import { useActionState } from "react";

import type { EventActionState } from "@/app/admin/actions";

type EventFormProps = {
  title: string;
  description?: string;
  submitLabel: string;
  action: (
    state: EventActionState,
    formData: FormData,
  ) => Promise<EventActionState>;
  initialValues?: {
    title?: string;
    slug?: string;
    location?: string;
    description?: string;
    visibility?: "DRAFT" | "HIDDEN" | "PUBLIC";
  };
};

const initialState: EventActionState = {};

export function EventForm({
  title,
  description,
  submitLabel,
  action,
  initialValues,
}: EventFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-2">
        <p className="editorial-label">Events</p>
        <h1 className="font-serif text-4xl tracking-[-0.03em] text-white">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-sm text-white/58">{description}</p>
        ) : null}
      </div>

      {state.error ? (
        <p className="rounded-2xl border border-[#c5965c]/30 bg-[#c5965c]/10 px-4 py-3 text-sm text-[#f3d1aa]">
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="block space-y-2 lg:col-span-2">
          <span className="text-sm text-white/68">Title</span>
          <input
            name="title"
            defaultValue={initialValues?.title}
            className="admin-input"
            required
          />
          {state.fieldErrors?.title ? (
            <span className="text-xs text-[#f3d1aa]">{state.fieldErrors.title}</span>
          ) : null}
        </label>

        <label className="block space-y-2">
          <span className="text-sm text-white/68">Slug</span>
          <input
            name="slug"
            defaultValue={initialValues?.slug}
            className="admin-input"
            placeholder="autumn-portrait-night"
            required
          />
          {state.fieldErrors?.slug ? (
            <span className="text-xs text-[#f3d1aa]">{state.fieldErrors.slug}</span>
          ) : null}
        </label>

        <label className="block space-y-2">
          <span className="text-sm text-white/68">Location</span>
          <input
            name="location"
            defaultValue={initialValues?.location}
            className="admin-input"
            placeholder="Brooklyn, New York"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm text-white/68">Visibility</span>
          <select
            name="visibility"
            defaultValue={initialValues?.visibility ?? "DRAFT"}
            className="admin-select"
          >
            <option value="DRAFT">Draft</option>
            <option value="HIDDEN">Hidden</option>
            <option value="PUBLIC">Public</option>
          </select>
        </label>

        <label className="block space-y-2 lg:col-span-2">
          <span className="text-sm text-white/68">Description</span>
          <textarea
            name="description"
            defaultValue={initialValues?.description}
            className="admin-textarea"
            placeholder="Optional public note"
          />
        </label>

        <label className="block space-y-2 lg:col-span-2">
          <span className="text-sm text-white/68">Cover image</span>
          <input
            name="coverImage"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="admin-input file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium file:text-black"
          />
        </label>
      </div>

      <p className="text-sm text-white/48">
        Event dates follow the photo timeline automatically.
      </p>

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-white px-5 py-3 text-sm font-medium text-black disabled:opacity-60"
      >
        {pending ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}
