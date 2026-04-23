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

import type { SiteProfileActionState } from "@/app/admin/actions";

type SiteProfileFormProps = {
  action: (
    state: SiteProfileActionState,
    formData: FormData,
  ) => Promise<SiteProfileActionState>;
  initialValues: {
    displayName: string;
    handle: string;
    linkUrl: string;
    headline: string;
    bio: string;
    coverFocalX: number;
    coverFocalY: number;
  };
  currentCoverUrl: string | null;
  currentLogoUrl: string | null;
};

const initialState: SiteProfileActionState = {};

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function SiteProfileForm({
  action,
  initialValues,
  currentCoverUrl,
  currentLogoUrl,
}: SiteProfileFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState(currentCoverUrl);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState(currentLogoUrl);
  const [coverFocalX, setCoverFocalX] = useState(initialValues.coverFocalX);
  const [coverFocalY, setCoverFocalY] = useState(initialValues.coverFocalY);
  const coverObjectUrlRef = useRef<string | null>(null);
  const logoObjectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    setCoverPreviewUrl(currentCoverUrl);
  }, [currentCoverUrl]);

  useEffect(() => {
    setLogoPreviewUrl(currentLogoUrl);
  }, [currentLogoUrl]);

  useEffect(() => {
    setCoverFocalX(initialValues.coverFocalX);
    setCoverFocalY(initialValues.coverFocalY);
  }, [initialValues.coverFocalX, initialValues.coverFocalY]);

  useEffect(() => {
    return () => {
      if (coverObjectUrlRef.current) {
        URL.revokeObjectURL(coverObjectUrlRef.current);
      }

      if (logoObjectUrlRef.current) {
        URL.revokeObjectURL(logoObjectUrlRef.current);
      }
    };
  }, []);

  const coverPosition = useMemo(
    () => `${coverFocalX}% ${coverFocalY}%`,
    [coverFocalX, coverFocalY],
  );

  function setFocusFromPointer(
    event: ReactPointerEvent<HTMLDivElement>,
    nextSetter: (x: number, y: number) => void,
  ) {
    const rect = event.currentTarget.getBoundingClientRect();
    const nextX = clampPercent(((event.clientX - rect.left) / rect.width) * 100);
    const nextY = clampPercent(((event.clientY - rect.top) / rect.height) * 100);
    nextSetter(nextX, nextY);
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
  }

  function handleLogoPreviewChange(file: File | null) {
    if (logoObjectUrlRef.current) {
      URL.revokeObjectURL(logoObjectUrlRef.current);
      logoObjectUrlRef.current = null;
    }

    if (!file) {
      setLogoPreviewUrl(currentLogoUrl);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    logoObjectUrlRef.current = objectUrl;
    setLogoPreviewUrl(objectUrl);
  }

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
          <span className="text-sm text-white/68">Link button</span>
          <input
            name="linkUrl"
            defaultValue={initialValues.linkUrl}
            className="admin-input"
            placeholder="https://example.com"
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

        <div className="space-y-3 rounded-[1.25rem] border border-white/8 bg-white/[0.03] px-4 py-4 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm text-white/78">Banner crop</p>
              <p className="text-sm text-white/48">Drag inside the frame.</p>
            </div>
            <div className="text-xs uppercase tracking-[0.22em] text-white/40">
              {Math.round(coverFocalX)} / {Math.round(coverFocalY)}
            </div>
          </div>

          <div
            className="relative cursor-crosshair overflow-hidden rounded-[1.35rem] border border-white/10 bg-[#090909] shadow-[0_20px_64px_rgba(0,0,0,0.28)]"
            style={{ aspectRatio: "21 / 10" }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              setFocusFromPointer(event, (x, y) => {
                setCoverFocalX(x);
                setCoverFocalY(y);
              });
            }}
            onPointerMove={(event) => {
              if ((event.buttons & 1) !== 1) {
                return;
              }

              setFocusFromPointer(event, (x, y) => {
                setCoverFocalX(x);
                setCoverFocalY(y);
              });
            }}
          >
            {coverPreviewUrl ? (
              <img
                src={coverPreviewUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                style={{ objectPosition: coverPosition }}
              />
            ) : (
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(197,146,92,0.26),_transparent_34%),linear-gradient(145deg,_#141414,_#070707)]" />
            )}
            <div className="absolute inset-0 bg-black/16" />
            <div className="absolute inset-x-[5%] top-[17%] bottom-[17%] rounded-[1.2rem] border border-white/42 bg-transparent shadow-[0_0_0_999px_rgba(0,0,0,0.43),inset_0_0_0_1px_rgba(255,255,255,0.08)]" />
            <div className="absolute left-1/2 top-[17%] h-[66%] w-px -translate-x-1/2 bg-white/18" />
            <div className="absolute left-[5%] top-1/2 h-px w-[90%] -translate-y-1/2 bg-white/18" />
            <div
              className="absolute h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/34 bg-black/42 shadow-[0_10px_28px_rgba(0,0,0,0.26)] backdrop-blur-xl"
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

        <label className="block space-y-2">
          <span className="text-sm text-white/68">Upload banner</span>
          <input
            name="heroImage"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="admin-input file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium file:text-black"
            onChange={(event) =>
              handleCoverPreviewChange(event.currentTarget.files?.[0] ?? null)
            }
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

        <div className="space-y-3 rounded-[1.25rem] border border-white/8 bg-white/[0.03] px-4 py-4 xl:col-span-2">
          <div className="space-y-1">
            <p className="text-sm text-white/78">Site mark</p>
            <p className="text-sm text-white/48">Shown as the home button on public pages.</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-[4.5rem] w-[4.5rem] items-center justify-center overflow-hidden rounded-[1.2rem] border border-white/10 bg-[#0b0b0b]">
              {logoPreviewUrl ? (
                <img src={logoPreviewUrl} alt="" className="h-full w-full object-contain p-3" />
              ) : (
                <span className="font-serif text-xl tracking-[-0.08em] text-white/82">Ku</span>
              )}
            </div>
            <label className="block min-w-[16rem] flex-1 space-y-2">
              <span className="text-sm text-white/68">Upload logo</span>
              <input
                name="logoImage"
                type="file"
                accept="image/png,image/webp,image/svg+xml,image/jpeg"
                className="admin-input file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium file:text-black"
                onChange={(event) =>
                  handleLogoPreviewChange(event.currentTarget.files?.[0] ?? null)
                }
              />
            </label>
          </div>
        </div>
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
