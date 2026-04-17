/* eslint-disable @next/next/no-img-element */
"use client";

import { startTransition, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { AdminTagPicker } from "@/components/admin/admin-tag-picker";
import { getTagCategoryLabel, type TagDraft } from "@/lib/tags";

type ProcessingState = "UPLOADED" | "PROCESSING" | "READY" | "FAILED";
type PhotoOrderMode = "AUTO" | "MANUAL";

type EventPhotoManagerProps = {
  eventId: string;
  eventSlug: string;
  photoOrderMode: PhotoOrderMode;
  eventOptions: Array<{
    id: string;
    title: string;
    slug: string;
    visibility: "DRAFT" | "HIDDEN" | "PUBLIC";
    eventDateLabel: string;
  }>;
  filters: {
    status: "ALL" | ProcessingState;
    query: string;
    page: number;
  };
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    pagePhotoCount: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
  };
  summary: {
    total: number;
    filteredCount: number;
    READY: number;
    PROCESSING: number;
    UPLOADED: number;
    FAILED: number;
  };
  duplicateCandidateCount: number;
  photos: Array<{
    id: string;
    sortOrder: number;
    processingState: ProcessingState;
    errorMessage: string | null;
    originalFilename: string;
    caption: string | null;
    altText: string | null;
    capturedAt: string | null;
    takenAtOverride: string | null;
    effectiveTakenAt: string | null;
    createdAt: string;
    previewUrl: string | null;
    previewWidth: number;
    previewHeight: number;
    tags: Array<{
      id: string;
      name: string;
      slug: string;
      category: "CHARACTER" | "EVENT" | "SPECIES" | "MAKER" | "GENERAL";
    }>;
    isCover: boolean;
  }>;
};

type NoticeState = {
  tone: "success" | "error";
  text: string;
} | null;

const statusOptions = [
  { value: "ALL", label: "All statuses" },
  { value: "READY", label: "Ready" },
  { value: "PROCESSING", label: "Processing" },
  { value: "UPLOADED", label: "Queued" },
  { value: "FAILED", label: "Failed" },
] as const;

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatEventOptionLabel(event: EventPhotoManagerProps["eventOptions"][number]) {
  return `${event.title} · ${event.slug} · ${event.eventDateLabel} · ${event.visibility.toLowerCase()}`;
}

function toDateTimeLocalValue(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function statusBadgeClass(status: ProcessingState) {
  switch (status) {
    case "READY":
      return "border border-emerald-400/25 bg-emerald-400/10 text-emerald-100";
    case "FAILED":
      return "border border-[#c5965c]/30 bg-[#c5965c]/10 text-[#f3d1aa]";
    case "PROCESSING":
      return "border border-sky-400/20 bg-sky-400/10 text-sky-100";
    default:
      return "border border-white/10 bg-white/6 text-white/72";
  }
}

function tagCategoryBadgeClass(category: TagDraft["category"]) {
  switch (category) {
    case "CHARACTER":
      return "border border-sky-400/20 bg-sky-400/10 text-sky-100";
    case "EVENT":
      return "border border-[#c5965c]/30 bg-[#c5965c]/10 text-[#f3d1aa]";
    case "SPECIES":
      return "border border-emerald-400/25 bg-emerald-400/10 text-emerald-100";
    case "MAKER":
      return "border border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-100";
    default:
      return "border border-white/10 bg-white/6 text-white/72";
  }
}

function buildEventHref(
  eventId: string,
  filters: EventPhotoManagerProps["filters"],
  overrides?: Partial<EventPhotoManagerProps["filters"]>,
) {
  const next = {
    ...filters,
    ...overrides,
  };
  const params = new URLSearchParams();

  if (next.query) {
    params.set("q", next.query);
  }

  if (next.status !== "ALL") {
    params.set("status", next.status);
  }

  if (next.page > 1) {
    params.set("page", String(next.page));
  }

  const queryString = params.toString();

  return queryString
    ? `/admin/events/${eventId}?${queryString}`
    : `/admin/events/${eventId}`;
}

function EventPhotoCard({
  eventId,
  eventSlug,
  photo,
  totalPhotos,
  selected,
  pendingAction,
  onToggleSelected,
  onAction,
  onSaveMetadata,
  onAddTags,
  onRemoveTag,
}: {
  eventId: string;
  eventSlug: string;
  photo: EventPhotoManagerProps["photos"][number];
  totalPhotos: number;
  selected: boolean;
  pendingAction: string | null;
  onToggleSelected: (photoId: string) => void;
  onAction: (args: {
    actionKey: string;
    confirmText?: string;
    request: () => Promise<{ message?: string }>;
  }) => Promise<void>;
  onSaveMetadata: (args: {
    photoId: string;
    caption: string;
    altText: string;
    takenAtOverride: string;
  }) => Promise<void>;
  onAddTags: (args: { photoId: string; tags: TagDraft[] }) => Promise<void>;
  onRemoveTag: (args: { photoId: string; tag: TagDraft }) => Promise<void>;
}) {
  const [caption, setCaption] = useState(photo.caption ?? "");
  const [altText, setAltText] = useState(photo.altText ?? "");
  const [takenAtOverride, setTakenAtOverride] = useState(
    toDateTimeLocalValue(photo.takenAtOverride),
  );
  const [selectedTags, setSelectedTags] = useState<TagDraft[]>([]);

  const actionLocked = pendingAction !== null;
  const metadataPending = pendingAction === `save:${photo.id}`;
  const canSetCover = photo.processingState === "READY" && !photo.isCover;
  const canReprocess =
    photo.processingState === "READY" || photo.processingState === "FAILED";

  return (
    <article
      className={`overflow-hidden rounded-[1.5rem] border shadow-[0_18px_54px_rgba(0,0,0,0.18)] transition ${
        selected ? "border-white/18 bg-white/7" : "border-white/8 bg-white/4"
      }`}
    >
      <div className="grid gap-4 p-4 md:grid-cols-[7.5rem_minmax(0,1fr)]">
        <div
          className="relative overflow-hidden rounded-[1.1rem] bg-[#0b0b0b]"
          style={{ aspectRatio: `${photo.previewWidth} / ${photo.previewHeight}` }}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelected(photo.id)}
            className="absolute left-3 top-3 z-10 h-4 w-4 accent-white"
          />

          {photo.previewUrl ? (
            <img
              src={photo.previewUrl}
              alt={photo.altText ?? photo.caption ?? photo.originalFilename}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-[linear-gradient(145deg,_rgba(255,255,255,0.06),_rgba(255,255,255,0.02))]" />
          )}
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="glass-chip px-3 py-1 text-[0.68rem] uppercase tracking-[0.28em] text-white">
                  #{photo.sortOrder + 1}
                </span>
                <span
                  className={`rounded-full px-3 py-1 text-[0.68rem] uppercase tracking-[0.28em] ${statusBadgeClass(photo.processingState)}`}
                >
                  {photo.processingState}
                </span>
                {photo.isCover ? (
                  <span className="glass-chip px-3 py-1 text-[0.68rem] uppercase tracking-[0.28em] text-white">
                    Cover
                  </span>
                ) : null}
              </div>
              <div>
                <p className="text-sm font-medium text-white/88">{photo.originalFilename}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-white/40">
                  /e/{eventSlug} · photo {photo.id}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  void onAction({
                    actionKey: `move-earlier:${photo.id}`,
                    request: async () => {
                      const response = await fetch(`/api/admin/photos/${photo.id}/move`, {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                          eventId,
                          direction: "earlier",
                        }),
                      });

                      const payload = (await response.json()) as {
                        error?: string;
                        message?: string;
                      };

                      if (!response.ok) {
                        throw new Error(payload.error ?? "Unable to move photo.");
                      }

                      return payload;
                    },
                  })
                }
                disabled={actionLocked || photo.sortOrder === 0}
                className="admin-button-muted px-3 py-2 text-sm"
              >
                {pendingAction === `move-earlier:${photo.id}` ? "Moving..." : "Earlier"}
              </button>
              <button
                type="button"
                onClick={() =>
                  void onAction({
                    actionKey: `move-later:${photo.id}`,
                    request: async () => {
                      const response = await fetch(`/api/admin/photos/${photo.id}/move`, {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                          eventId,
                          direction: "later",
                        }),
                      });

                      const payload = (await response.json()) as {
                        error?: string;
                        message?: string;
                      };

                      if (!response.ok) {
                        throw new Error(payload.error ?? "Unable to move photo.");
                      }

                      return payload;
                    },
                  })
                }
                disabled={actionLocked || photo.sortOrder >= totalPhotos - 1}
                className="admin-button-muted px-3 py-2 text-sm"
              >
                {pendingAction === `move-later:${photo.id}` ? "Moving..." : "Later"}
              </button>
              <button
                type="button"
                onClick={() =>
                  void onAction({
                    actionKey: `set-cover:${photo.id}`,
                    request: async () => {
                      const response = await fetch(`/api/admin/photos/${photo.id}/cover`, {
                        method: "POST",
                      });

                      const payload = (await response.json()) as {
                        error?: string;
                        message?: string;
                      };

                      if (!response.ok) {
                        throw new Error(payload.error ?? "Unable to set cover image.");
                      }

                      return payload;
                    },
                  })
                }
                disabled={actionLocked || !canSetCover}
                className="admin-button-muted px-3 py-2 text-sm"
              >
                {pendingAction === `set-cover:${photo.id}`
                  ? "Saving..."
                  : photo.isCover
                    ? "Current cover"
                    : "Set cover"}
              </button>
            </div>
          </div>

          <div className="grid gap-2 text-sm text-white/58 sm:grid-cols-2">
            <p>
              Order time:{" "}
              <span className="text-white/74">{formatDateTime(photo.effectiveTakenAt)}</span>
            </p>
            <p>
              Uploaded: <span className="text-white/74">{formatDateTime(photo.createdAt)}</span>
            </p>
            <p>
              EXIF taken:{" "}
              <span className="text-white/74">{formatDateTime(photo.capturedAt)}</span>
            </p>
            <p>
              Override:{" "}
              <span className="text-white/74">
                {photo.takenAtOverride ? formatDateTime(photo.takenAtOverride) : "Not set"}
              </span>
            </p>
          </div>

          {photo.caption || photo.altText ? (
            <div className="grid gap-2 text-sm text-white/58 sm:grid-cols-2">
              <p>
                Caption:{" "}
                <span className="text-white/74">{photo.caption || "Not set"}</span>
              </p>
              <p>
                Alt text:{" "}
                <span className="text-white/74">{photo.altText || "Not set"}</span>
              </p>
            </div>
          ) : null}

          {photo.tags.length ? (
            <div className="space-y-2">
              <p className="text-sm text-white/58">Tags</p>
              <div className="flex flex-wrap gap-2">
                {photo.tags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() =>
                      void onRemoveTag({
                        photoId: photo.id,
                        tag,
                      })
                    }
                    disabled={actionLocked}
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs ${tagCategoryBadgeClass(tag.category)} disabled:opacity-40`}
                  >
                    <span className="text-white/58">{getTagCategoryLabel(tag.category)}</span>
                    <span>{tag.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {photo.errorMessage ? (
            <p className="rounded-2xl border border-[#c5965c]/30 bg-[#c5965c]/10 px-3 py-2 text-sm text-[#f3d1aa]">
              {photo.errorMessage}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Link
              href={`/p/${photo.id}`}
              className="admin-button-muted px-3 py-2 text-sm"
            >
              Open photo page
            </Link>
            <button
              type="button"
              onClick={() =>
                void onAction({
                  actionKey: `reprocess:${photo.id}`,
                  request: async () => {
                    const response = await fetch(`/api/admin/photos/${photo.id}/reprocess`, {
                      method: "POST",
                    });

                    const payload = (await response.json()) as {
                      error?: string;
                      message?: string;
                    };

                    if (!response.ok) {
                      throw new Error(payload.error ?? "Unable to queue processing.");
                    }

                    return payload;
                  },
                })
              }
              disabled={actionLocked || !canReprocess}
              className="admin-button-muted px-3 py-2 text-sm"
            >
              {pendingAction === `reprocess:${photo.id}`
                ? "Queueing..."
                : photo.processingState === "FAILED"
                  ? "Retry processing"
                  : "Reprocess"}
            </button>
            <button
              type="button"
              onClick={() =>
                void onAction({
                  actionKey: `delete:${photo.id}`,
                  confirmText:
                    "Delete this photo? This removes the original file, derivatives, and metadata.",
                  request: async () => {
                    const response = await fetch(`/api/admin/photos/${photo.id}`, {
                      method: "DELETE",
                    });

                    const payload = (await response.json()) as {
                      error?: string;
                      message?: string;
                    };

                    if (!response.ok) {
                      throw new Error(payload.error ?? "Unable to delete photo.");
                    }

                    return payload;
                  },
                })
              }
              disabled={actionLocked}
              className="rounded-full border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100 disabled:opacity-40"
            >
              {pendingAction === `delete:${photo.id}` ? "Deleting..." : "Delete"}
            </button>
          </div>

          <details className="muted-panel px-4 py-4">
            <summary className="cursor-pointer list-none text-sm text-white/78">
              Edit details
            </summary>
            <form
              className="mt-4 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void onSaveMetadata({
                  photoId: photo.id,
                  caption,
                  altText,
                  takenAtOverride,
                });
              }}
            >
              <label className="block space-y-2">
                <span className="text-sm text-white/68">Caption</span>
                <textarea
                  value={caption}
                  onChange={(event) => setCaption(event.target.value)}
                  className="admin-textarea min-h-24"
                  placeholder="Optional display caption"
                />
              </label>

              <details className="rounded-[1.05rem] border border-white/8 bg-white/[0.025] px-4 py-4">
                <summary className="cursor-pointer list-none text-sm text-white/64">
                  Advanced
                </summary>
                <div className="mt-4 space-y-3">
                  <label className="block space-y-2">
                    <span className="text-sm text-white/68">Alt text</span>
                    <input
                      value={altText}
                      onChange={(event) => setAltText(event.target.value)}
                      className="admin-input"
                      placeholder="Optional screen reader copy"
                    />
                  </label>

                  <label className="block space-y-2">
                    <span className="text-sm text-white/68">Taken time override</span>
                    <input
                      type="datetime-local"
                      value={takenAtOverride}
                      onChange={(event) => setTakenAtOverride(event.target.value)}
                      className="admin-input"
                    />
                  </label>
                </div>
              </details>

              <button
                type="submit"
                disabled={actionLocked}
                className="admin-button-muted"
              >
                {metadataPending ? "Saving..." : "Save changes"}
              </button>
            </form>

            <div className="mt-5 border-t border-white/8 pt-5">
              <AdminTagPicker
                selectedTags={selectedTags}
                onChange={setSelectedTags}
                disabled={actionLocked}
                label="Tags"
                placeholder="Search or create tags"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void onAddTags({
                      photoId: photo.id,
                      tags: selectedTags,
                    })
                  }
                  disabled={actionLocked || selectedTags.length === 0}
                  className="admin-button-muted"
                >
                  {pendingAction === `tags:add:${photo.id}` ? "Saving..." : "Add tags"}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTags([])}
                  disabled={actionLocked || selectedTags.length === 0}
                  className="admin-button-muted"
                >
                  Clear
                </button>
              </div>
            </div>
          </details>
        </div>
      </div>
    </article>
  );
}

export function EventPhotoManager({
  eventId,
  eventSlug,
  photoOrderMode,
  eventOptions,
  filters,
  pagination,
  summary,
  duplicateCandidateCount,
  photos,
}: EventPhotoManagerProps) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkCaption, setBulkCaption] = useState("");
  const [bulkAltText, setBulkAltText] = useState("");
  const [bulkTags, setBulkTags] = useState<TagDraft[]>([]);
  const [moveDestinationEventId, setMoveDestinationEventId] = useState("");

  const allPagePhotoIds = photos.map((photo) => photo.id);
  const pageSelectedIds = selectedIds.filter((photoId) =>
    allPagePhotoIds.includes(photoId),
  );
  const selectedPhotos = photos.filter((photo) => pageSelectedIds.includes(photo.id));
  const selectedReadyCount = selectedPhotos.filter(
    (photo) => photo.processingState === "READY",
  ).length;
  const selectedFailedCount = selectedPhotos.filter(
    (photo) => photo.processingState === "FAILED",
  ).length;
  const moveDestinationEvent = eventOptions.find(
    (candidate) => candidate.id === moveDestinationEventId,
  );
  const allPageSelected =
    allPagePhotoIds.length > 0 &&
    allPagePhotoIds.every((photoId) => pageSelectedIds.includes(photoId));

  function togglePhotoSelection(photoId: string) {
    setSelectedIds((current) => {
      const selected = new Set(current.filter((id) => allPagePhotoIds.includes(id)));

      if (selected.has(photoId)) {
        selected.delete(photoId);
      } else {
        selected.add(photoId);
      }

      return [...selected];
    });
  }

  function togglePageSelection() {
    if (allPageSelected) {
      setSelectedIds([]);
      return;
    }

    setSelectedIds(allPagePhotoIds);
  }

  async function runAction(args: {
    actionKey: string;
    confirmText?: string;
    request: () => Promise<{ message?: string }>;
  }) {
    if (args.confirmText && !window.confirm(args.confirmText)) {
      return;
    }

    setPendingAction(args.actionKey);
    setNotice(null);

    try {
      const payload = await args.request();

      setNotice({
        tone: "success",
        text: payload.message ?? "Photo updated.",
      });
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Photo update failed.",
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function runBulkAction(args: {
    action:
      | "delete"
      | "retry-failed"
      | "reprocess-ready"
      | "move-to-event"
      | "add-tags"
      | "remove-tags"
      | "set-cover"
      | "set-caption"
      | "clear-caption"
      | "set-alt-text"
      | "clear-alt-text"
      | "clear-taken-at-override";
    confirmText?: string;
    payload?: Record<string, unknown>;
  }) {
    if (!pageSelectedIds.length) {
      return;
    }

    if (args.confirmText && !window.confirm(args.confirmText)) {
      return;
    }

    setPendingAction(`bulk:${args.action}`);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/photos/bulk", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: args.action,
          photoIds: pageSelectedIds,
          ...args.payload,
        }),
      });

      const payload = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to apply bulk action.");
      }

      if (
        args.action === "delete" ||
        args.action === "retry-failed" ||
        args.action === "reprocess-ready" ||
        args.action === "move-to-event" ||
        args.action === "clear-caption" ||
        args.action === "clear-alt-text" ||
        args.action === "clear-taken-at-override"
      ) {
        setSelectedIds([]);
      }

      if (args.action === "move-to-event") {
        setMoveDestinationEventId("");
      }

      setNotice({
        tone: "success",
        text: payload.message ?? "Bulk photo action applied.",
      });
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text:
          error instanceof Error ? error.message : "Unable to apply bulk photo action.",
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function moveSelectedPhotos() {
    if (!pageSelectedIds.length) {
      return;
    }

    if (!moveDestinationEvent) {
      setNotice({
        tone: "error",
        text: "Choose a destination event first.",
      });
      return;
    }

    await runBulkAction({
      action: "move-to-event",
      confirmText: `Move ${pageSelectedIds.length} selected photo${pageSelectedIds.length === 1 ? "" : "s"} to ${moveDestinationEvent.title}? Files, metadata, import links, and derivatives stay attached to the same photo records.`,
      payload: {
        destinationEventId: moveDestinationEvent.id,
      },
    });
  }

  async function addTagsToPhoto(args: { photoId: string; tags: TagDraft[] }) {
    if (!args.tags.length) {
      setNotice({
        tone: "error",
        text: "Choose one or more tags first.",
      });
      return;
    }

    setPendingAction(`tags:add:${args.photoId}`);
    setNotice(null);

    try {
      const response = await fetch(`/api/admin/photos/${args.photoId}/tags`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tags: args.tags,
        }),
      });

      const payload = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to add tags.");
      }

      setNotice({
        tone: "success",
        text: payload.message ?? "Tags added to photo.",
      });
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to add tags.",
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function removeTagFromPhoto(args: { photoId: string; tag: TagDraft }) {
    setPendingAction(`tags:remove:${args.photoId}:${args.tag.slug ?? args.tag.name}`);
    setNotice(null);

    try {
      const response = await fetch(`/api/admin/photos/${args.photoId}/tags`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tags: [args.tag],
        }),
      });

      const payload = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to remove tag.");
      }

      setNotice({
        tone: "success",
        text: payload.message ?? "Tag removed from photo.",
      });
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to remove tag.",
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function applyBulkTags(action: "add-tags" | "remove-tags") {
    if (!pageSelectedIds.length) {
      return;
    }

    if (!bulkTags.length) {
      setNotice({
        tone: "error",
        text: "Choose one or more tags first.",
      });
      return;
    }

    await runBulkAction({
      action,
      payload: {
        tags: bulkTags,
      },
    });

    setBulkTags([]);
  }

  async function saveMetadata(args: {
    photoId: string;
    caption: string;
    altText: string;
    takenAtOverride: string;
  }) {
    setPendingAction(`save:${args.photoId}`);
    setNotice(null);

    try {
      const response = await fetch(`/api/admin/photos/${args.photoId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          caption: args.caption,
          altText: args.altText,
          takenAtOverride: args.takenAtOverride || null,
        }),
      });

      const payload = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to save photo details.");
      }

      setNotice({
        tone: "success",
        text: payload.message ?? "Photo details updated.",
      });
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to save photo details.",
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function resetAutomaticOrder() {
    if (
      !window.confirm(
        "Restore automatic ordering? Manual adjustments will be replaced by taken time and upload time.",
      )
    ) {
      return;
    }

    setPendingAction("reset-order");
    setNotice(null);

    try {
      const response = await fetch(`/api/admin/events/${eventId}/photo-order`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "AUTO",
        }),
      });

      const payload = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to restore automatic order.");
      }

      setNotice({
        tone: "success",
        text: payload.message ?? "Automatic ordering restored.",
      });
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to restore automatic order.",
      });
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <section className="space-y-6 sm:space-y-7">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-2">
          <p className="editorial-label">Photo Management</p>
          <h2 className="font-serif text-3xl tracking-[-0.03em] text-white">
            Event library
          </h2>
          <p className="max-w-3xl text-sm text-white/58">
            Sort, cover, tags, and cleanup for <span className="text-white/76">/e/{eventSlug}</span>.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-sm text-white/58">
          <span className="glass-chip px-4 py-2">{summary.READY} ready</span>
          <span className="glass-chip px-4 py-2">{summary.PROCESSING} processing</span>
          <span className="glass-chip px-4 py-2">{summary.UPLOADED} queued</span>
          <span className="glass-chip px-4 py-2">{summary.FAILED} failed</span>
          {duplicateCandidateCount > 0 ? (
            <Link
              href={`/admin/duplicates?scope=EVENT&eventId=${eventId}`}
              className="admin-button-muted"
            >
              {duplicateCandidateCount} duplicate groups
            </Link>
          ) : null}
        </div>
      </div>

      <div className="admin-card space-y-5 px-6 py-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <p className="text-sm text-white/68">
              {photoOrderMode === "MANUAL"
                ? "Manual order is active."
                : "Automatic order follows taken time, EXIF time, then upload time."}
            </p>
            <p className="text-sm text-white/52">
              Showing {pagination.pagePhotoCount} of {summary.filteredCount} filtered photos
              {summary.filteredCount !== summary.total ? ` from ${summary.total} total` : ""}.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {photoOrderMode === "MANUAL" ? (
              <button
                type="button"
                onClick={() => void resetAutomaticOrder()}
                disabled={pendingAction !== null}
                className="admin-button-muted"
              >
                {pendingAction === "reset-order"
                  ? "Restoring..."
                  : "Restore automatic order"}
              </button>
            ) : null}
            {duplicateCandidateCount > 0 ? (
               <Link
                 href={`/admin/duplicates?scope=EVENT&eventId=${eventId}`}
                 className="admin-button-muted"
               >
                Review duplicates
              </Link>
            ) : null}
          </div>
        </div>

        <form
          action={`/admin/events/${eventId}`}
          method="get"
          className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_12rem_auto]"
        >
          <input
            type="search"
            name="q"
            defaultValue={filters.query}
            className="admin-input"
            placeholder="Search filename, caption, tag, or ID"
          />
          <select
            name="status"
            defaultValue={filters.status}
            className="admin-select"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button type="submit" className="admin-button">
              Apply
            </button>
            <Link href={`/admin/events/${eventId}`} className="admin-button-muted">
              Clear
            </Link>
          </div>
        </form>

        {notice ? (
          <p className={notice.tone === "success" ? "admin-note" : "admin-note-error"}>
            {notice.text}
          </p>
        ) : null}

        {photos.length ? (
          <>
            <div className="muted-panel px-5 py-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="editorial-label">Selection</p>
                  <p className="text-sm text-white/64">
                    {pageSelectedIds.length
                      ? `${pageSelectedIds.length} selected`
                      : "Select photos on this page."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={togglePageSelection}
                  className="admin-button-muted"
                >
                  {allPageSelected ? "Clear page selection" : "Select page"}
                </button>
              </div>

              {pageSelectedIds.length ? (
                <>
                  <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)]">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          void runBulkAction({
                            action: "set-cover",
                          })
                        }
                        disabled={pendingAction !== null || selectedReadyCount !== 1}
                        className="admin-button-muted"
                      >
                        {pendingAction === "bulk:set-cover" ? "Saving..." : "Set as cover"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void runBulkAction({
                            action: "retry-failed",
                          })
                        }
                        disabled={pendingAction !== null || selectedFailedCount === 0}
                        className="admin-button-muted"
                      >
                        {pendingAction === "bulk:retry-failed"
                          ? "Queueing..."
                          : `Retry failed${selectedFailedCount ? ` (${selectedFailedCount})` : ""}`}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void runBulkAction({
                            action: "reprocess-ready",
                          })
                        }
                        disabled={pendingAction !== null || selectedReadyCount === 0}
                        className="admin-button-muted"
                      >
                        {pendingAction === "bulk:reprocess-ready"
                          ? "Queueing..."
                          : `Reprocess${selectedReadyCount ? ` (${selectedReadyCount})` : ""}`}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void runBulkAction({
                            action: "delete",
                            confirmText: `Delete ${pageSelectedIds.length} selected photo${pageSelectedIds.length === 1 ? "" : "s"}? Originals, derivatives, and metadata will be removed.`,
                          })
                        }
                        disabled={pendingAction !== null}
                        className="rounded-full border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm text-red-100 disabled:opacity-40"
                      >
                        {pendingAction === "bulk:delete"
                          ? "Deleting..."
                          : `Delete${pageSelectedIds.length ? ` (${pageSelectedIds.length})` : ""}`}
                      </button>
                    </div>

                    <div className="rounded-[1.25rem] border border-white/8 bg-white/[0.03] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                      <p className="text-xs uppercase tracking-[0.22em] text-white/38">
                        Move
                      </p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <select
                          value={moveDestinationEventId}
                          onChange={(event) => setMoveDestinationEventId(event.target.value)}
                          className="admin-select"
                          disabled={pendingAction !== null || eventOptions.length === 0}
                        >
                          <option value="">Choose another event</option>
                          {eventOptions.map((eventOption) => (
                            <option key={eventOption.id} value={eventOption.id}>
                              {formatEventOptionLabel(eventOption)}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => void moveSelectedPhotos()}
                          disabled={pendingAction !== null || !moveDestinationEvent}
                          className="admin-button-muted"
                        >
                          {pendingAction === "bulk:move-to-event" ? "Moving..." : "Move"}
                        </button>
                      </div>
                      <p className="mt-3 text-sm text-white/52">
                        {eventOptions.length
                          ? "Moves keep metadata and derivatives."
                          : "Create another event first."}
                      </p>
                    </div>
                  </div>

                  <details className="muted-panel mt-4 px-4 py-4">
                <summary className="cursor-pointer list-none text-sm text-white/78">
                  Bulk captions
                </summary>
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <div className="space-y-3">
                    <label className="block space-y-2">
                      <span className="text-sm text-white/68">Caption</span>
                      <textarea
                        value={bulkCaption}
                        onChange={(event) => setBulkCaption(event.target.value)}
                        className="admin-textarea min-h-24"
                        placeholder="Apply one caption to all selected photos"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (!bulkCaption.trim()) {
                            setNotice({
                              tone: "error",
                              text: "Enter a caption first, or clear it.",
                            });
                            return;
                          }

                          void runBulkAction({
                            action: "set-caption",
                            payload: {
                              caption: bulkCaption,
                            },
                          });
                        }}
                        disabled={pendingAction !== null || pageSelectedIds.length === 0}
                        className="admin-button-muted"
                      >
                        {pendingAction === "bulk:set-caption"
                          ? "Saving..."
                          : "Set caption"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void runBulkAction({
                            action: "clear-caption",
                          })
                        }
                        disabled={pendingAction !== null || pageSelectedIds.length === 0}
                        className="admin-button-muted"
                      >
                        {pendingAction === "bulk:clear-caption"
                          ? "Clearing..."
                          : "Clear captions"}
                      </button>
                    </div>
                  </div>

                  <details className="rounded-[1.05rem] border border-white/8 bg-white/[0.025] px-4 py-4">
                    <summary className="cursor-pointer list-none text-sm text-white/64">
                      Accessibility and capture
                    </summary>
                    <div className="mt-4 space-y-3">
                      <label className="block space-y-2">
                        <span className="text-sm text-white/68">Alt text</span>
                        <input
                          value={bulkAltText}
                          onChange={(event) => setBulkAltText(event.target.value)}
                          className="admin-input"
                          placeholder="Apply one alt text value"
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (!bulkAltText.trim()) {
                              setNotice({
                                tone: "error",
                                text: "Enter alt text first, or clear it.",
                              });
                              return;
                            }

                            void runBulkAction({
                              action: "set-alt-text",
                              payload: {
                                altText: bulkAltText,
                              },
                            });
                          }}
                          disabled={pendingAction !== null}
                          className="admin-button-muted"
                        >
                          {pendingAction === "bulk:set-alt-text" ? "Saving..." : "Set alt text"}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void runBulkAction({
                              action: "clear-alt-text",
                            })
                          }
                          disabled={pendingAction !== null}
                          className="admin-button-muted"
                        >
                          {pendingAction === "bulk:clear-alt-text" ? "Clearing..." : "Clear alt text"}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void runBulkAction({
                              action: "clear-taken-at-override",
                            })
                          }
                          disabled={pendingAction !== null}
                          className="admin-button-muted"
                        >
                          {pendingAction === "bulk:clear-taken-at-override"
                            ? "Clearing..."
                            : "Clear taken override"}
                        </button>
                      </div>
                    </div>
                  </details>
                </div>
                  </details>

                  <details className="muted-panel mt-4 px-4 py-4">
                <summary className="cursor-pointer list-none text-sm text-white/78">
                  Bulk tags
                </summary>
                <div className="mt-4 space-y-4">
                  <AdminTagPicker
                    selectedTags={bulkTags}
                    onChange={setBulkTags}
                    disabled={pendingAction !== null}
                    label="Tags"
                    placeholder="Search existing tags or create a new typed tag"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void applyBulkTags("add-tags")}
                      disabled={pendingAction !== null || bulkTags.length === 0}
                      className="admin-button-muted"
                    >
                      {pendingAction === "bulk:add-tags" ? "Saving..." : "Add tags"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void applyBulkTags("remove-tags")}
                      disabled={pendingAction !== null || bulkTags.length === 0}
                      className="admin-button-muted"
                    >
                      {pendingAction === "bulk:remove-tags" ? "Removing..." : "Remove tags"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setBulkTags([])}
                      disabled={pendingAction !== null || bulkTags.length === 0}
                      className="admin-button-muted"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                  </details>
                </>
              ) : null}
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              {photos.map((photo) => (
                <EventPhotoCard
                  key={`${photo.id}:${photo.processingState}:${photo.sortOrder}:${photo.caption ?? ""}:${photo.altText ?? ""}:${photo.takenAtOverride ?? ""}`}
                  eventId={eventId}
                  eventSlug={eventSlug}
                  photo={photo}
                  totalPhotos={summary.total}
                  selected={pageSelectedIds.includes(photo.id)}
                  pendingAction={pendingAction}
                  onToggleSelected={togglePhotoSelection}
                  onAction={runAction}
                  onSaveMetadata={saveMetadata}
                  onAddTags={addTagsToPhoto}
                  onRemoveTag={removeTagFromPhoto}
                />
              ))}
            </div>

            {pagination.totalPages > 1 ? (
              <nav className="muted-panel flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm text-white/68">
                <Link
                  href={buildEventHref(eventId, filters, {
                    page: Math.max(1, filters.page - 1),
                  })}
                  className={`rounded-full border px-4 py-2 ${
                    pagination.hasPreviousPage
                      ? "border-white/10 bg-white/4 text-white/72"
                      : "pointer-events-none border-white/6 bg-white/[0.02] text-white/28"
                  }`}
                >
                  Previous
                </Link>
                <p>
                  Page {pagination.page} of {pagination.totalPages}
                </p>
                <Link
                  href={buildEventHref(eventId, filters, {
                    page: Math.min(pagination.totalPages, filters.page + 1),
                  })}
                  className={`rounded-full border px-4 py-2 ${
                    pagination.hasNextPage
                      ? "border-white/10 bg-white/4 text-white/72"
                      : "pointer-events-none border-white/6 bg-white/[0.02] text-white/28"
                  }`}
                >
                  Next
                </Link>
              </nav>
            ) : null}
          </>
        ) : (
          <div className="muted-panel px-5 py-8 text-sm text-white/58">
            No photos matched the current filters.
          </div>
        )}
      </div>
    </section>
  );
}
