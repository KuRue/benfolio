/* eslint-disable @next/next/no-img-element */
"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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
    kicker?: string;
    slug?: string;
    location?: string;
    description?: string;
    visibility?: "DRAFT" | "HIDDEN" | "PUBLIC";
    coverFocalX?: number;
    coverFocalY?: number;
  };
  currentCoverUrl?: string | null;
};

const initialState: EventActionState = {};

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function EventForm({
  title,
  description,
  submitLabel,
  action,
  initialValues,
  currentCoverUrl = null,
}: EventFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  const initialFocalX = initialValues?.coverFocalX ?? 50;
  const initialFocalY = initialValues?.coverFocalY ?? 50;

  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(
    currentCoverUrl,
  );
  const [coverFocalX, setCoverFocalX] = useState(initialFocalX);
  const [coverFocalY, setCoverFocalY] = useState(initialFocalY);
  const coverObjectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    setCoverPreviewUrl(currentCoverUrl);
  }, [currentCoverUrl]);

  useEffect(() => {
    setCoverFocalX(initialFocalX);
    setCoverFocalY(initialFocalY);
  }, [initialFocalX, initialFocalY]);

  useEffect(() => {
    return () => {
      if (coverObjectUrlRef.current) {
        URL.revokeObjectURL(coverObjectUrlRef.current);
      }
    };
  }, []);

  const coverPosition = useMemo(
    () => `${coverFocalX}% ${coverFocalY}%`,
    [coverFocalX, coverFocalY],
  );

  function setFocusFromPointer(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const nextX = clampPercent(((event.clientX - rect.left) / rect.width) * 100);
    const nextY = clampPercent(((event.clientY - rect.top) / rect.height) * 100);
    setCoverFocalX(nextX);
    setCoverFocalY(nextY);
  }

  function handleCoverPreviewChange(file: File | null) {
    if (coverObjectUrlRef.current) {
      URL.revokeObjectURL(coverObjectUrlRef.current);
      coverObjectUrlRef.current = null;
    }

    if (!file) {
      setCoverPreviewUrl(currentCoverUrl);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    coverObjectUrlRef.current = objectUrl;
    setCoverPreviewUrl(objectUrl);
    // When a new image comes in, start centered — old focal is unlikely to
    // match the new composition.
    setCoverFocalX(50);
    setCoverFocalY(50);
  }

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

        <label className="block space-y-2 lg:col-span-2">
          <span className="text-sm text-white/68">Series</span>
          <input
            name="kicker"
            defaultValue={initialValues?.kicker}
            className="admin-input"
            placeholder="e.g. WCFF 2026"
          />
          <span className="text-xs text-white/48">
            Optional. Shows as a small caption above the title. Use for event
            series or brand names — leave blank for stand-alone events.
          </span>
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

        <div className="space-y-3 rounded-[1.25rem] border border-white/8 bg-white/[0.03] px-4 py-4 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm text-white/78">Cover crop</p>
              <p className="text-sm text-white/48">
                Drag the dot to choose what stays in frame on the event banner and on cards.
              </p>
            </div>
            <div className="text-xs uppercase tracking-[0.22em] text-white/40">
              {Math.round(coverFocalX)} / {Math.round(coverFocalY)}
            </div>
          </div>

          <div
            className="relative overflow-hidden rounded-[1.35rem] border border-white/10 bg-[#090909] shadow-[0_20px_64px_rgba(0,0,0,0.28)] touch-none select-none"
            style={{ aspectRatio: "16 / 9" }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              setFocusFromPointer(event);
            }}
            onPointerMove={(event) => {
              if ((event.buttons & 1) !== 1) {
                return;
              }

              setFocusFromPointer(event);
            }}
          >
            {coverPreviewUrl ? (
              <img
                src={coverPreviewUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                style={{ objectPosition: coverPosition }}
                draggable={false}
              />
            ) : (
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(197,146,92,0.26),_transparent_34%),linear-gradient(145deg,_#141414,_#070707)]" />
            )}
            <div className="absolute inset-0 bg-black/14" />
            <div className="absolute inset-x-[7%] top-[22%] bottom-[22%] rounded-[1.2rem] border border-white/18 bg-black/8 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] pointer-events-none" />
            <div
              className="pointer-events-none absolute h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/28 bg-black/34 shadow-[0_10px_28px_rgba(0,0,0,0.26)] backdrop-blur-xl"
              style={{
                left: `${coverFocalX}%`,
                top: `${coverFocalY}%`,
              }}
            >
              <span className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/92" />
            </div>
          </div>

          <input type="hidden" name="coverFocalX" value={Math.round(coverFocalX)} />
          <input type="hidden" name="coverFocalY" value={Math.round(coverFocalY)} />
        </div>

        <label className="block space-y-2 lg:col-span-2">
          <span className="text-sm text-white/68">Cover image</span>
          <input
            name="coverImage"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="admin-input file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium file:text-black"
            onChange={(event) =>
              handleCoverPreviewChange(event.currentTarget.files?.[0] ?? null)
            }
          />
          <span className="text-xs text-white/48">
            Optional. Upload a new image to replace the current cover, or just adjust the crop above.
          </span>
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
