/* eslint-disable @next/next/no-img-element */
"use client";

import { startTransition, useDeferredValue, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { formatShortDate } from "@/lib/strings";

type SiteProfilePhotoLibraryProps = {
  photos: Array<{
    id: string;
    originalFilename: string;
    createdAt: string;
    caption: string | null;
    altText: string | null;
    previewUrl: string | null;
    previewWidth: number;
    previewHeight: number;
    isCurrentHero: boolean;
    isCurrentAvatar: boolean;
    event: {
      title: string;
      slug: string;
      eventDate: string;
    };
  }>;
};

type NoticeState = {
  tone: "success" | "error";
  text: string;
} | null;

export function SiteProfilePhotoLibrary({
  photos,
}: SiteProfilePhotoLibraryProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);

  const filteredPhotos = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return photos;
    }

    return photos.filter((photo) =>
      [
        photo.id,
        photo.originalFilename,
        photo.caption ?? "",
        photo.altText ?? "",
        photo.event.title,
        photo.event.slug,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [deferredQuery, photos]);

  async function assignPhoto(slot: "cover" | "avatar", photoId: string) {
    const key = `${slot}:${photoId}`;
    setPendingKey(key);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/site-profile/media", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          slot,
          photoId,
        }),
      });

      const payload = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to update profile media.");
      }

      setNotice({
        tone: "success",
        text: payload.message ?? "Profile media updated.",
      });
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to update profile media.",
      });
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <section className="admin-card space-y-6 px-6 py-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="editorial-label">Processed Library</p>
          <h2 className="font-serif text-3xl tracking-[-0.03em] text-white">
            Choose hero and avatar from existing photos
          </h2>
          <p className="max-w-2xl text-sm leading-7 text-white/58">
            Reuse finished derivatives first so the public homepage stays visually
            consistent with the gallery.
          </p>
        </div>

        <label className="block w-full max-w-sm space-y-2">
          <span className="text-sm text-white/68">Search the library</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="admin-input"
            placeholder="Search by event, file, caption, or photo ID"
          />
        </label>
      </div>

      {notice ? (
        <p
          className={`rounded-2xl px-4 py-3 text-sm ${
            notice.tone === "success"
              ? "border border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
              : "border border-[#c5965c]/30 bg-[#c5965c]/10 text-[#f3d1aa]"
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      {filteredPhotos.length ? (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {filteredPhotos.map((photo) => {
            const pendingHero = pendingKey === `cover:${photo.id}`;
            const pendingAvatar = pendingKey === `avatar:${photo.id}`;

            return (
              <article
                key={photo.id}
                className="overflow-hidden rounded-[1.5rem] border border-white/8 bg-white/4"
              >
                <div
                  className="relative bg-[#0b0b0b]"
                  style={{ aspectRatio: `${photo.previewWidth} / ${photo.previewHeight}` }}
                >
                  {photo.previewUrl ? (
                    <img
                      src={photo.previewUrl}
                      alt={photo.altText ?? photo.caption ?? photo.originalFilename}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-[linear-gradient(145deg,_rgba(255,255,255,0.06),_rgba(255,255,255,0.02))]" />
                  )}
                  <div className="absolute inset-x-0 top-0 flex flex-wrap gap-2 p-3">
                    {photo.isCurrentHero ? (
                      <span className="glass-chip px-3 py-1 text-[0.68rem] uppercase tracking-[0.28em] text-white">
                        Hero
                      </span>
                    ) : null}
                    {photo.isCurrentAvatar ? (
                      <span className="glass-chip px-3 py-1 text-[0.68rem] uppercase tracking-[0.28em] text-white">
                        Avatar
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-4 px-4 py-4">
                  <div className="space-y-2">
                    <p className="text-sm text-white/82">{photo.event.title}</p>
                    <p className="text-xs uppercase tracking-[0.22em] text-white/44">
                      {formatShortDate(new Date(photo.event.eventDate))} · {photo.originalFilename}
                    </p>
                    <p className="text-sm leading-6 text-white/58">
                      {photo.caption ?? photo.altText ?? `Photo ${photo.id}`}
                    </p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => assignPhoto("cover", photo.id)}
                      disabled={pendingKey !== null || photo.isCurrentHero}
                      className="rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-white disabled:opacity-40"
                    >
                      {pendingHero
                        ? "Saving..."
                        : photo.isCurrentHero
                          ? "Current hero"
                          : "Use as hero"}
                    </button>
                    <button
                      type="button"
                      onClick={() => assignPhoto("avatar", photo.id)}
                      disabled={pendingKey !== null || photo.isCurrentAvatar}
                      className="rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-white disabled:opacity-40"
                    >
                      {pendingAvatar
                        ? "Saving..."
                        : photo.isCurrentAvatar
                          ? "Current avatar"
                          : "Use as avatar"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[1.5rem] border border-white/8 bg-white/4 px-5 py-8 text-sm text-white/58">
          No processed photos matched the current search yet.
        </div>
      )}
    </section>
  );
}
