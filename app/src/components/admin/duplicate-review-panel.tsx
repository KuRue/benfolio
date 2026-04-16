/* eslint-disable @next/next/no-img-element */
"use client";

import { startTransition, useEffect, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

type DuplicateReviewPanelProps = {
  filters: {
    scope: "LIBRARY" | "EVENT";
    eventId: string;
    visibility: "ACTIVE" | "ALL";
    page: number;
  };
  totalGroups: number;
  totalPages: number;
  eventOptions: Array<{
    id: string;
    title: string;
    slug: string;
    eventDate: string;
  }>;
  groups: Array<{
    hash: string;
    photoCount: number;
    eventCount: number;
    latestPhotoCreatedAt: string;
    reviewDecision: "KEEP_BOTH" | "DISMISSED" | null;
    reviewedAt: string | null;
    reviewSnapshotCurrent: boolean;
    photos: Array<{
      id: string;
      processingState: string;
      originalFilename: string;
      caption: string | null;
      altText: string | null;
      capturedAt: string | null;
      takenAtOverride: string | null;
      effectiveTakenAt: string | null;
      createdAt: string;
      sortOrder: number;
      isCover: boolean;
      event: {
        id: string;
        slug: string;
        title: string;
      };
      previewUrl: string | null;
      importContext: {
        sourceKey: string;
        status: string;
        sourceProvider: string | null;
        trigger: "scan" | "webhook";
      } | null;
    }>;
  }>;
};

type NoticeState = {
  tone: "success" | "error";
  text: string;
} | null;

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatEventOptionLabel(
  event: DuplicateReviewPanelProps["eventOptions"][number],
) {
  const eventDate = event.eventDate
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(event.eventDate))
    : "No date";

  return `${event.title} · ${event.slug} · ${eventDate}`;
}

function buildHref(
  filters: DuplicateReviewPanelProps["filters"],
  overrides?: Partial<DuplicateReviewPanelProps["filters"]>,
) {
  const next = {
    ...filters,
    ...overrides,
  };
  const params = new URLSearchParams();

  params.set("scope", next.scope);
  params.set("visibility", next.visibility);

  if (next.scope === "EVENT" && next.eventId) {
    params.set("eventId", next.eventId);
  }

  if (next.page > 1) {
    params.set("page", String(next.page));
  }

  return `/admin/duplicates?${params.toString()}`;
}

function photoStatusClass(status: string) {
  switch (status) {
    case "READY":
      return "border border-emerald-400/20 bg-emerald-400/10 text-emerald-100";
    case "FAILED":
      return "border border-[#c5965c]/30 bg-[#c5965c]/10 text-[#f3d1aa]";
    case "PROCESSING":
      return "border border-sky-400/20 bg-sky-400/10 text-sky-100";
    default:
      return "border border-white/10 bg-white/6 text-white/72";
  }
}

function reviewLabel(
  decision: "KEEP_BOTH" | "DISMISSED" | null,
  reviewSnapshotCurrent: boolean,
) {
  if (decision === "KEEP_BOTH") {
    return reviewSnapshotCurrent
      ? "Current snapshot reviewed: keep both"
      : "Earlier review: keep both";
  }

  if (decision === "DISMISSED") {
    return reviewSnapshotCurrent
      ? "Current snapshot reviewed: dismissed"
      : "Earlier review: dismissed";
  }

  return null;
}

export function DuplicateReviewPanel({
  filters,
  totalGroups,
  totalPages,
  eventOptions,
  groups,
}: DuplicateReviewPanelProps) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [selectedByHash, setSelectedByHash] = useState<Record<string, string[]>>({});
  const [moveTargetByHash, setMoveTargetByHash] = useState<Record<string, string>>({});

  useEffect(() => {
    setSelectedByHash({});
    setMoveTargetByHash({});
  }, [groups]);

  function getScopeEventId(explicitEventId?: string) {
    return filters.scope === "EVENT" ? explicitEventId ?? filters.eventId : null;
  }

  function togglePhotoSelection(hash: string, photoId: string) {
    setSelectedByHash((current) => {
      const selected = new Set(current[hash] ?? []);

      if (selected.has(photoId)) {
        selected.delete(photoId);
      } else {
        selected.add(photoId);
      }

      return {
        ...current,
        [hash]: [...selected],
      };
    });
  }

  function toggleGroupSelection(hash: string, photoIds: string[]) {
    setSelectedByHash((current) => {
      const selected = new Set(current[hash] ?? []);
      const allSelected = photoIds.every((photoId) => selected.has(photoId));

      if (allSelected) {
        return {
          ...current,
          [hash]: [],
        };
      }

      return {
        ...current,
        [hash]: photoIds,
      };
    });
  }

  function clearGroupSelection(hash: string) {
    setSelectedByHash((current) => ({
      ...current,
      [hash]: [],
    }));
  }

  async function submitReviewDecision(args: {
    hash: string;
    decision: "KEEP_BOTH" | "DISMISSED";
    eventId?: string;
  }) {
    const response = await fetch("/api/admin/duplicates/review", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        scope: filters.scope,
        eventId: getScopeEventId(args.eventId),
        hash: args.hash,
        decision: args.decision,
      }),
    });

    const payload = (await response.json()) as { error?: string; message?: string };

    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to update duplicate review.");
    }

    return payload;
  }

  async function refreshAfterAction(message: string, hash?: string) {
    if (hash) {
      clearGroupSelection(hash);
      setMoveTargetByHash((current) => ({
        ...current,
        [hash]: "",
      }));
    }

    setNotice({
      tone: "success",
      text: message,
    });
    startTransition(() => {
      router.refresh();
    });
  }

  async function reviewGroup(
    hash: string,
    decision: "KEEP_BOTH" | "DISMISSED",
    eventId?: string,
  ) {
    setPendingAction(`review:${decision}:${hash}`);
    setNotice(null);

    try {
      const payload = await submitReviewDecision({
        hash,
        decision,
        eventId,
      });
      await refreshAfterAction(payload.message ?? "Duplicate review updated.", hash);
    } catch (error) {
      setNotice({
        tone: "error",
        text:
          error instanceof Error ? error.message : "Unable to update duplicate review.",
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function runBulkPhotoAction(args: {
    hash: string;
    actionKey: string;
    photoIds: string[];
    confirmText: string;
    requestBody: Record<string, unknown>;
    emptySelectionMessage: string;
    successMessage?: string;
    afterSuccess?: () => Promise<void>;
  }) {
    if (!args.photoIds.length) {
      setNotice({
        tone: "error",
        text: args.emptySelectionMessage,
      });
      return;
    }

    if (!window.confirm(args.confirmText)) {
      return;
    }

    setPendingAction(args.actionKey);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/photos/bulk", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(args.requestBody),
      });

      const payload = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to update duplicate selections.");
      }

      if (args.afterSuccess) {
        await args.afterSuccess();
      }

      await refreshAfterAction(
        args.successMessage ?? payload.message ?? "Duplicate workflow updated.",
        args.hash,
      );
    } catch (error) {
      setNotice({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to update duplicate selections.",
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function deleteSelectedDuplicates(hash: string) {
    const selectedIds = selectedByHash[hash] ?? [];

    await runBulkPhotoAction({
      hash,
      actionKey: `delete:${hash}`,
      photoIds: selectedIds,
      emptySelectionMessage: "Select at least one duplicate first.",
      confirmText: `Delete ${selectedIds.length} selected duplicate photo${selectedIds.length === 1 ? "" : "s"}? Originals, derivatives, and metadata will be removed.`,
      requestBody: {
        action: "delete",
        photoIds: selectedIds,
      },
      successMessage: "Deleted the selected duplicate photos.",
    });
  }

  async function keepSelectedDeleteRest(
    group: DuplicateReviewPanelProps["groups"][number],
  ) {
    const selectedIds = selectedByHash[group.hash] ?? [];
    const deleteIds = group.photos
      .filter((photo) => !selectedIds.includes(photo.id))
      .map((photo) => photo.id);
    const keptPhotos = group.photos.filter((photo) => selectedIds.includes(photo.id));
    const keepLabel =
      keptPhotos.length === 1 ? keptPhotos[0]!.originalFilename : `${keptPhotos.length} photos`;

    await runBulkPhotoAction({
      hash: group.hash,
      actionKey: `resolve:${group.hash}`,
      photoIds: deleteIds,
      emptySelectionMessage:
        "Select the photo or photos you want to keep before resolving this group.",
      confirmText: `Keep ${keepLabel} and delete ${deleteIds.length} other exact matches?`,
      requestBody: {
        action: "delete",
        photoIds: deleteIds,
      },
      successMessage:
        keptPhotos.length === 1
          ? "Kept one photo and removed the remaining exact matches."
          : `Kept ${keptPhotos.length} photos and removed ${deleteIds.length} others.`,
      afterSuccess:
        keptPhotos.length > 1
          ? async () => {
              await submitReviewDecision({
                hash: group.hash,
                decision: "KEEP_BOTH",
                eventId: filters.scope === "EVENT" ? filters.eventId : undefined,
              });
            }
          : undefined,
    });
  }

  async function moveSelectedDuplicates(
    group: DuplicateReviewPanelProps["groups"][number],
  ) {
    const selectedIds = selectedByHash[group.hash] ?? [];
    const destinationEventId = moveTargetByHash[group.hash];
    const destinationEvent = eventOptions.find(
      (event) => event.id === destinationEventId,
    );

    if (!destinationEvent) {
      setNotice({
        tone: "error",
        text: "Choose a destination event before moving duplicates.",
      });
      return;
    }

    await runBulkPhotoAction({
      hash: group.hash,
      actionKey: `move:${group.hash}`,
      photoIds: selectedIds,
      emptySelectionMessage: "Select at least one photo to move first.",
      confirmText: `Move ${selectedIds.length} selected duplicate photo${selectedIds.length === 1 ? "" : "s"} to ${destinationEvent.title}? Metadata, hashes, derivatives, and import links stay attached to the same photo records.`,
      requestBody: {
        action: "move-to-event",
        photoIds: selectedIds,
        destinationEventId: destinationEvent.id,
      },
    });
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="editorial-label">Duplicate Review</p>
        <h1 className="font-serif text-4xl tracking-[-0.03em] text-white">
          Exact-hash duplicate candidates
        </h1>
        <p className="max-w-3xl text-sm leading-7 text-white/58">
          Duplicate groups are built from exact SHA-256 matches on stored photos. No
          files are removed automatically. Review a group, keep intentional matches,
          move mistakes into the right event, or delete extras deliberately.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="admin-card px-5 py-6">
          <p className="text-sm text-white/54">Visible groups</p>
          <p className="mt-3 font-serif text-4xl text-white">{totalGroups}</p>
        </div>
        <div className="admin-card px-5 py-6">
          <p className="text-sm text-white/54">Scope</p>
          <p className="mt-3 font-serif text-4xl text-white">
            {filters.scope === "EVENT" ? "Event" : "Library"}
          </p>
        </div>
        <div className="admin-card px-5 py-6">
          <p className="text-sm text-white/54">Visibility</p>
          <p className="mt-3 font-serif text-4xl text-white">
            {filters.visibility === "ALL" ? "All" : "Active"}
          </p>
        </div>
      </section>

      <section className="admin-card space-y-5 px-6 py-6">
        <div className="space-y-2">
          <p className="editorial-label">Filters</p>
          <h2 className="font-serif text-3xl tracking-[-0.03em] text-white">
            Focus review work
          </h2>
        </div>

        <form
          action="/admin/duplicates"
          method="get"
          className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)_180px_auto]"
        >
          <select
            name="scope"
            defaultValue={filters.scope}
            className="admin-select"
          >
            <option value="LIBRARY">Whole library</option>
            <option value="EVENT">Single event</option>
          </select>

          <select
            name="eventId"
            defaultValue={filters.eventId}
            className="admin-select"
          >
            <option value="">Choose event</option>
            {eventOptions.map((event) => (
              <option key={event.id} value={event.id}>
                {event.title} · {event.slug}
              </option>
            ))}
          </select>

          <select
            name="visibility"
            defaultValue={filters.visibility}
            className="admin-select"
          >
            <option value="ACTIVE">Active queue</option>
            <option value="ALL">Include reviewed</option>
          </select>

          <div className="flex gap-2">
            <button type="submit" className="admin-button">
              Apply
            </button>
            <Link href="/admin/duplicates" className="admin-button-muted">
              Clear
            </Link>
          </div>
        </form>

        {notice ? (
          <p className={notice.tone === "success" ? "admin-note" : "admin-note-error"}>
            {notice.text}
          </p>
        ) : null}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="editorial-label">Groups</p>
            <h2 className="mt-2 font-serif text-3xl tracking-[-0.03em] text-white">
              Review exact matches
            </h2>
          </div>
          <div className="flex items-center gap-2 text-sm text-white/58">
            <span>Page {filters.page}</span>
            <span>/</span>
            <span>{totalPages}</span>
          </div>
        </div>

        {groups.length ? (
          <div className="grid gap-4">
            {groups.map((group) => {
              const selectedIds = selectedByHash[group.hash] ?? [];
              const selectedPhotos = group.photos.filter((photo) =>
                selectedIds.includes(photo.id),
              );
              const selectedCount = selectedPhotos.length;
              const deletableCount = group.photoCount - selectedCount;
              const allPhotoIds = group.photos.map((photo) => photo.id);
              const allSelected =
                allPhotoIds.length > 0 &&
                allPhotoIds.every((photoId) => selectedIds.includes(photoId));
              const reviewState = reviewLabel(
                group.reviewDecision,
                group.reviewSnapshotCurrent,
              );
              const moveDestination = eventOptions.find(
                (event) => event.id === moveTargetByHash[group.hash],
              );
              const keepSelectedLabel =
                selectedCount === 1
                  ? "Keep one, delete rest"
                  : `Keep selected, delete others${deletableCount ? ` (${deletableCount})` : ""}`;

              return (
                <article key={group.hash} className="admin-card space-y-5 px-6 py-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="glass-chip px-3 py-1 text-[0.68rem] uppercase tracking-[0.28em] text-white">
                          Exact SHA-256 match
                        </span>
                        <span className="glass-chip px-3 py-1 text-[0.68rem] uppercase tracking-[0.28em] text-white">
                          {group.photoCount} photos
                        </span>
                        <span className="glass-chip px-3 py-1 text-[0.68rem] uppercase tracking-[0.28em] text-white">
                          {group.eventCount} events
                        </span>
                        {reviewState ? (
                          <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[0.68rem] uppercase tracking-[0.28em] text-white/66">
                            {reviewState}
                          </span>
                        ) : (
                          <span className="rounded-full border border-[#c5965c]/25 bg-[#c5965c]/10 px-3 py-1 text-[0.68rem] uppercase tracking-[0.28em] text-[#f3d1aa]">
                            Review pending
                          </span>
                        )}
                      </div>

                      <div className="space-y-1">
                        <h3 className="font-mono text-sm text-white/80">
                          {group.hash}
                        </h3>
                        <p className="text-sm text-white/54">
                          Latest addition {formatDateTime(group.latestPhotoCreatedAt)}
                          {group.reviewedAt
                            ? ` · reviewed ${formatDateTime(group.reviewedAt)}`
                            : ""}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void reviewGroup(group.hash, "KEEP_BOTH")}
                        disabled={pendingAction !== null}
                        className="admin-button-muted"
                      >
                        {pendingAction === `review:KEEP_BOTH:${group.hash}`
                          ? "Saving..."
                          : "Keep both"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void reviewGroup(group.hash, "DISMISSED")}
                        disabled={pendingAction !== null}
                        className="admin-button-muted"
                      >
                        {pendingAction === `review:DISMISSED:${group.hash}`
                          ? "Saving..."
                          : "Dismiss group"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteSelectedDuplicates(group.hash)}
                        disabled={pendingAction !== null || selectedCount === 0}
                        className="rounded-full border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm text-red-100 disabled:opacity-40"
                      >
                        {pendingAction === `delete:${group.hash}`
                          ? "Deleting..."
                          : `Delete selected only${selectedCount ? ` (${selectedCount})` : ""}`}
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-4 rounded-3xl border border-white/8 bg-black/25 px-4 py-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
                    <div className="space-y-2">
                      <p className="text-sm text-white/74">
                        Strong candidate confidence comes from exact stored hash equality.
                      </p>
                      <p className="text-sm text-white/58">
                        {selectedCount
                          ? `${selectedCount} selected${deletableCount ? ` · ${deletableCount} would be removed by the keep action` : ""}`
                          : "Select the photo or photos you want to keep, delete, or move."}
                      </p>
                      <p className="text-xs uppercase tracking-[0.24em] text-white/40">
                        Source/import context and cover status are shown for each item
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => toggleGroupSelection(group.hash, allPhotoIds)}
                          className="admin-button-muted"
                        >
                          {allSelected ? "Clear group selection" : "Select group"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void keepSelectedDeleteRest(group)}
                          disabled={
                            pendingAction !== null ||
                            selectedCount === 0 ||
                            selectedCount === group.photoCount
                          }
                          className="admin-button-muted"
                        >
                          {pendingAction === `resolve:${group.hash}`
                            ? "Resolving..."
                            : keepSelectedLabel}
                        </button>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <select
                          value={moveTargetByHash[group.hash] ?? ""}
                          onChange={(event) =>
                            setMoveTargetByHash((current) => ({
                              ...current,
                              [group.hash]: event.target.value,
                            }))
                          }
                          className="admin-select"
                          disabled={pendingAction !== null}
                        >
                          <option value="">Move selected to another event</option>
                          {eventOptions.map((event) => (
                            <option key={event.id} value={event.id}>
                              {formatEventOptionLabel(event)}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => void moveSelectedDuplicates(group)}
                          disabled={
                            pendingAction !== null ||
                            selectedCount === 0 ||
                            !moveDestination
                          }
                          className="admin-button-muted"
                        >
                          {pendingAction === `move:${group.hash}`
                            ? "Moving..."
                            : "Move selected"}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    {group.photos.map((photo) => {
                      const selected = selectedIds.includes(photo.id);

                      return (
                        <div
                          key={photo.id}
                          className={`grid gap-4 rounded-[1.5rem] border px-4 py-4 transition ${
                            selected
                              ? "border-white/20 bg-white/7"
                              : "border-white/8 bg-white/4"
                          } md:grid-cols-[7rem_minmax(0,1fr)]`}
                        >
                          <div className="relative overflow-hidden rounded-[1.1rem] bg-[#0b0b0b]">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => togglePhotoSelection(group.hash, photo.id)}
                              className="absolute left-3 top-3 h-4 w-4 accent-white"
                            />
                            {photo.previewUrl ? (
                              <img
                                src={photo.previewUrl}
                                alt={photo.altText ?? photo.caption ?? photo.originalFilename}
                                className="aspect-square h-full w-full object-cover"
                              />
                            ) : (
                              <div className="aspect-square h-full w-full bg-[linear-gradient(145deg,_rgba(255,255,255,0.08),_rgba(255,255,255,0.02))]" />
                            )}
                          </div>

                          <div className="space-y-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="space-y-1">
                                <p className="text-sm text-white">{photo.originalFilename}</p>
                                <p className="text-xs uppercase tracking-[0.24em] text-white/40">
                                  #{photo.sortOrder + 1} in {photo.event.slug}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <span
                                  className={`rounded-full px-3 py-1 text-[0.68rem] uppercase tracking-[0.28em] ${photoStatusClass(photo.processingState)}`}
                                >
                                  {photo.processingState}
                                </span>
                                {photo.isCover ? (
                                  <span className="glass-chip px-3 py-1 text-[0.68rem] uppercase tracking-[0.28em] text-white">
                                    Event cover
                                  </span>
                                ) : null}
                                {selected ? (
                                  <span className="glass-chip px-3 py-1 text-[0.68rem] uppercase tracking-[0.28em] text-white">
                                    Selected
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div className="grid gap-2 text-sm text-white/58 sm:grid-cols-2">
                              <p>
                                Event:{" "}
                                <Link
                                  href={`/admin/events/${photo.event.id}`}
                                  className="text-white/76"
                                >
                                  {photo.event.title}
                                </Link>
                              </p>
                              <p>
                                Added:{" "}
                                <span className="text-white/76">
                                  {formatDateTime(photo.createdAt)}
                                </span>
                              </p>
                              <p>
                                Effective taken:{" "}
                                <span className="text-white/76">
                                  {formatDateTime(photo.effectiveTakenAt)}
                                </span>
                              </p>
                              <p>
                                EXIF taken:{" "}
                                <span className="text-white/76">
                                  {formatDateTime(photo.capturedAt)}
                                </span>
                              </p>
                              <p>
                                Override:{" "}
                                <span className="text-white/76">
                                  {photo.takenAtOverride
                                    ? formatDateTime(photo.takenAtOverride)
                                    : "Not set"}
                                </span>
                              </p>
                              <p>
                                Snapshot:{" "}
                                <span className="text-white/76">
                                  {group.reviewSnapshotCurrent
                                    ? "Reviewed current snapshot"
                                    : "Needs review"}
                                </span>
                              </p>
                            </div>

                            {photo.caption ? (
                              <p className="text-sm text-white/58">
                                Caption: <span className="text-white/74">{photo.caption}</span>
                              </p>
                            ) : null}
                            {photo.altText ? (
                              <p className="text-sm text-white/58">
                                Alt text: <span className="text-white/74">{photo.altText}</span>
                              </p>
                            ) : null}

                            {photo.importContext ? (
                              <div className="rounded-2xl border border-white/8 bg-black/25 px-3 py-3 text-sm text-white/56">
                                <p className="text-xs uppercase tracking-[0.22em] text-white/38">
                                  Import context
                                </p>
                                <p className="mt-2 break-all text-white/72">
                                  {photo.importContext.sourceKey}
                                </p>
                                <p className="mt-2 text-white/56">
                                  {photo.importContext.trigger} ·{" "}
                                  {photo.importContext.status}
                                  {photo.importContext.sourceProvider
                                    ? ` · ${photo.importContext.sourceProvider}`
                                    : ""}
                                </p>
                              </div>
                            ) : null}

                            <div className="flex flex-wrap gap-2 pt-1">
                              <Link
                                href={`/admin/events/${photo.event.id}`}
                                className="admin-button-muted"
                              >
                                Open event
                              </Link>
                              <Link
                                href={`/p/${photo.id}`}
                                className="admin-button-muted"
                              >
                                Open photo
                              </Link>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="admin-card px-6 py-10 text-center text-sm text-white/58">
            No duplicate groups match the current scope.
          </div>
        )}
      </section>

      {totalPages > 1 ? (
        <nav className="muted-panel flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm text-white/68">
          <Link
            href={buildHref(filters, {
              page: Math.max(1, filters.page - 1),
            })}
            className={`rounded-full border px-4 py-2 ${
              filters.page > 1
                ? "border-white/10 bg-white/4 text-white/72"
                : "pointer-events-none border-white/6 bg-white/[0.02] text-white/28"
            }`}
          >
            Previous
          </Link>
          <p>
            Page {filters.page} of {totalPages}
          </p>
          <Link
            href={buildHref(filters, {
              page: Math.min(totalPages, filters.page + 1),
            })}
            className={`rounded-full border px-4 py-2 ${
              filters.page < totalPages
                ? "border-white/10 bg-white/4 text-white/72"
                : "pointer-events-none border-white/6 bg-white/[0.02] text-white/28"
            }`}
          >
            Next
          </Link>
        </nav>
      ) : null}
    </div>
  );
}
