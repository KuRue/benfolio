"use client";

import { startTransition, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

type ImportJobStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
type ImportItemStatus = "PENDING" | "RUNNING" | "COMPLETE" | "FAILED" | "SKIPPED";
type ImportCleanupStatus =
  | "NOT_REQUIRED"
  | "PENDING"
  | "DELETED"
  | "ARCHIVED"
  | "FAILED";

type ImportsPanelProps = {
  filters: {
    status: string;
    query: string;
    visibility: string;
  };
  jobStatusSummary: Record<string, number>;
  itemStatusSummary: Record<string, number>;
  bulkActionSummary: {
    retryFailed: number;
    retryCleanupFailed: number;
    dismissTerminal: number;
  };
  jobs: Array<{
    id: string;
    status: ImportJobStatus;
    trigger: "scan" | "webhook";
    adapterId: string | null;
    errorMessage: string | null;
    processedItems: number;
    totalItems: number;
    createdAt: string;
    startedAt: string | null;
    finishedAt: string | null;
    eventSlug: string | null;
    sourcePrefix: string | null;
    sourcePathExample: string | null;
    cleanupMode: "delete" | "archive" | null;
    fileCount: number;
    itemCounts: {
      pending: number;
      running: number;
      complete: number;
      failed: number;
      skipped: number;
    };
    event: {
      id: string;
      slug: string;
      title: string;
    } | null;
    requestedBy: {
      displayName: string;
    } | null;
  }>;
  items: Array<{
    id: string;
    status: ImportItemStatus;
    sourceKey: string;
    sourceFilename: string;
    sourceByteSize: string | null;
    sourceLastModified: string | null;
    sourceProvider: string | null;
    sourceEtag: string | null;
    sourceVersion: string | null;
    contentHashSha256: string | null;
    eventSlug: string;
    cleanupMode: string | null;
    cleanupStatus: ImportCleanupStatus;
    cleanupTargetKey: string | null;
    cleanupError: string | null;
    skipReason: string | null;
    errorMessage: string | null;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
    dismissedAt: string | null;
    trigger: "scan" | "webhook";
    event: {
      id: string;
      slug: string;
      title: string;
    } | null;
    photo: {
      id: string;
      processingState: string;
    } | null;
    importJob: {
      id: string;
      status: ImportJobStatus;
      createdAt: string;
    };
    timeline: Array<{
      id: string;
      eventType: string;
      label: string;
      detail: string | null;
      createdAt: string;
    }>;
    possibleDuplicates: Array<{
      id: string;
      sourceKey: string;
      eventSlug: string;
      event: {
        id: string;
        slug: string;
        title: string;
      } | null;
      photo: {
        id: string;
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
    return "Not started";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatRelativeState(value: string | null) {
  if (!value) {
    return "Not recorded";
  }

  return formatDateTime(value);
}

function formatBytes(value: string | null) {
  if (!value) {
    return null;
  }

  const bytes = Number(value);

  if (!Number.isFinite(bytes) || bytes <= 0) {
    return null;
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB"];
  let size = bytes / 1024;
  let unit = units[0];

  for (const candidate of units) {
    unit = candidate;

    if (size < 1024 || candidate === units.at(-1)) {
      break;
    }

    size /= 1024;
  }

  return `${size.toFixed(size >= 10 ? 0 : 1)} ${unit}`;
}

function jobStatusClass(status: ImportJobStatus) {
  switch (status) {
    case "SUCCEEDED":
      return "border border-emerald-400/20 bg-emerald-400/10 text-emerald-100";
    case "FAILED":
      return "border border-[#c5965c]/30 bg-[#c5965c]/10 text-[#f3d1aa]";
    case "RUNNING":
      return "border border-sky-400/20 bg-sky-400/10 text-sky-100";
    default:
      return "border border-white/10 bg-white/6 text-white/72";
  }
}

function itemStatusClass(status: ImportItemStatus) {
  switch (status) {
    case "COMPLETE":
      return "border border-emerald-400/20 bg-emerald-400/10 text-emerald-100";
    case "FAILED":
      return "border border-[#c5965c]/30 bg-[#c5965c]/10 text-[#f3d1aa]";
    case "RUNNING":
      return "border border-sky-400/20 bg-sky-400/10 text-sky-100";
    case "SKIPPED":
      return "border border-white/10 bg-white/8 text-white/70";
    default:
      return "border border-white/10 bg-white/6 text-white/72";
  }
}

function cleanupClass(status: ImportCleanupStatus) {
  switch (status) {
    case "DELETED":
    case "ARCHIVED":
      return "glass-chip px-3 py-1 text-[0.68rem] uppercase tracking-[0.28em] text-white";
    case "FAILED":
      return "rounded-full border border-[#c5965c]/30 bg-[#c5965c]/10 px-3 py-1 text-[0.68rem] uppercase tracking-[0.28em] text-[#f3d1aa]";
    case "PENDING":
      return "rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-[0.68rem] uppercase tracking-[0.28em] text-sky-100";
    default:
      return "rounded-full border border-white/10 bg-white/4 px-3 py-1 text-[0.68rem] uppercase tracking-[0.28em] text-white/62";
  }
}

function compactId(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}...` : value;
}

function formatHash(value: string | null) {
  if (!value) {
    return "Not computed";
  }

  return `${value.slice(0, 12)}...`;
}

export function ImportsPanel({
  filters,
  jobStatusSummary,
  itemStatusSummary,
  bulkActionSummary,
  jobs,
  items,
}: ImportsPanelProps) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);

  async function runScan() {
    setPendingAction("scan");
    setNotice(null);

    try {
      const response = await fetch("/api/admin/imports/scan", {
        method: "POST",
      });

      const payload = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to scan imports.");
      }

      setNotice({
        tone: "success",
        text: payload.message ?? "Imports scan queued.",
      });
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to scan imports.",
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function retryImportJob(jobId: string) {
    setPendingAction(`retry-job:${jobId}`);
    setNotice(null);

    try {
      const response = await fetch(`/api/admin/imports/${jobId}/retry`, {
        method: "POST",
      });

      const payload = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to retry failed import items.");
      }

      setNotice({
        tone: "success",
        text: payload.message ?? "Failed import items queued again.",
      });
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to retry failed import items.",
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function retryImportItem(itemId: string) {
    setPendingAction(`retry-item:${itemId}`);
    setNotice(null);

    try {
      const response = await fetch(`/api/admin/imports/items/${itemId}/retry`, {
        method: "POST",
      });

      const payload = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to retry import item.");
      }

      setNotice({
        tone: "success",
        text: payload.message ?? "Import item retry queued.",
      });
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to retry import item.",
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function runBulkAction(
    action: "retry-failed" | "retry-cleanup-failed" | "dismiss-terminal",
    confirmation: string,
  ) {
    if (!window.confirm(confirmation)) {
      return;
    }

    setPendingAction(`bulk:${action}`);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/imports/bulk", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action,
          filters,
        }),
      });

      const payload = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to apply bulk import action.");
      }

      setNotice({
        tone: "success",
        text: payload.message ?? "Bulk import action applied.",
      });
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to apply bulk import action.",
      });
    } finally {
      setPendingAction(null);
    }
  }

  const summaryCards = [
    { label: "Pending", value: itemStatusSummary.PENDING ?? 0 },
    { label: "Running", value: itemStatusSummary.RUNNING ?? 0 },
    { label: "Complete", value: itemStatusSummary.COMPLETE ?? 0 },
    { label: "Failed", value: itemStatusSummary.FAILED ?? 0 },
    { label: "Skipped", value: itemStatusSummary.SKIPPED ?? 0 },
  ];

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <p className="editorial-label">Imports</p>
          <h1 className="font-serif text-3xl tracking-[-0.03em] text-white sm:text-[2.45rem]">
            Imports
          </h1>
        </div>
        <button
          type="button"
          onClick={() => void runScan()}
          disabled={pendingAction !== null}
          className="admin-button"
        >
          {pendingAction === "scan" ? "Scanning..." : "Scan imports"}
        </button>
      </section>

      <section className="admin-card space-y-4 px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="editorial-label">Status</p>
          <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.22em] text-white/44">
            <span>{jobStatusSummary.PENDING ?? 0} jobs pending</span>
            <span>{jobStatusSummary.RUNNING ?? 0} running</span>
            <span>{jobStatusSummary.SUCCEEDED ?? 0} complete</span>
            <span>{jobStatusSummary.FAILED ?? 0} failed</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {summaryCards.map((card) => (
            <span
              key={card.label}
              className="rounded-full border border-white/10 bg-white/4 px-3 py-1.5 text-xs uppercase tracking-[0.24em] text-white/68"
            >
              {card.label} {card.value}
            </span>
          ))}
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
      </section>

      <section className="admin-card space-y-4 px-5 py-5 sm:px-6 sm:py-6">
        <div className="space-y-1.5">
          <p className="editorial-label">Filters</p>
          <h2 className="font-serif text-[1.85rem] tracking-[-0.03em] text-white">
            Filter imports
          </h2>
        </div>

        <form
          action="/admin/imports"
          method="get"
          className="grid gap-3 md:grid-cols-[1fr_220px_180px_auto]"
        >
          <input
            type="search"
            name="q"
            defaultValue={filters.query}
            placeholder="Search by event slug or object key"
            className="admin-input"
          />
          <select
            name="status"
            defaultValue={filters.status}
            className="admin-select"
          >
            <option value="ALL">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="RUNNING">Running</option>
            <option value="COMPLETE">Complete</option>
            <option value="FAILED">Failed</option>
            <option value="SKIPPED">Skipped</option>
          </select>
          <select
            name="visibility"
            defaultValue={filters.visibility}
            className="admin-select"
          >
            <option value="ACTIVE">Active queue</option>
            <option value="ALL">Include dismissed</option>
          </select>
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black"
            >
              Apply
            </button>
            <Link
              href="/admin/imports"
              className="rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-white/72"
            >
              Clear
            </Link>
          </div>
        </form>

        <div className="grid gap-3 border-t border-white/8 pt-5 md:grid-cols-3">
          <button
            type="button"
            disabled={pendingAction !== null || bulkActionSummary.retryFailed === 0}
            onClick={() =>
              void runBulkAction(
                "retry-failed",
                `Retry ${bulkActionSummary.retryFailed} failed import items in the current filter?`,
              )
            }
            className="rounded-[1.3rem] border border-white/10 bg-white/4 px-4 py-4 text-left text-sm text-white disabled:opacity-45"
          >
            <span className="editorial-label">Retry</span>
            <span className="mt-2 block text-white">Retry failed items</span>
            <span className="mt-2 block text-white/52">{bulkActionSummary.retryFailed} visible</span>
          </button>
          <button
            type="button"
            disabled={
              pendingAction !== null || bulkActionSummary.retryCleanupFailed === 0
            }
            onClick={() =>
              void runBulkAction(
                "retry-cleanup-failed",
                `Retry cleanup for ${bulkActionSummary.retryCleanupFailed} failed import items in the current filter?`,
              )
            }
            className="rounded-[1.3rem] border border-white/10 bg-white/4 px-4 py-4 text-left text-sm text-white disabled:opacity-45"
          >
            <span className="editorial-label">Cleanup</span>
            <span className="mt-2 block text-white">Retry cleanup failures</span>
            <span className="mt-2 block text-white/52">{bulkActionSummary.retryCleanupFailed} visible</span>
          </button>
          <button
            type="button"
            disabled={pendingAction !== null || bulkActionSummary.dismissTerminal === 0}
            onClick={() =>
              void runBulkAction(
                "dismiss-terminal",
                `Dismiss ${bulkActionSummary.dismissTerminal} completed or skipped items from the active queue? Failed items will remain visible.`,
              )
            }
            className="rounded-[1.3rem] border border-white/10 bg-white/4 px-4 py-4 text-left text-sm text-white disabled:opacity-45"
          >
            <span className="editorial-label">Dismiss</span>
            <span className="mt-2 block text-white">Dismiss complete and skipped</span>
            <span className="mt-2 block text-white/52">{bulkActionSummary.dismissTerminal} visible</span>
          </button>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="editorial-label">Jobs</p>
            <h2 className="mt-2 font-serif text-[1.85rem] tracking-[-0.03em] text-white">
              Job history
            </h2>
          </div>
          <Link
            href="/admin/uploads"
            className="rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-white/72"
          >
            Open uploader
          </Link>
        </div>

        {jobs.length ? (
          <div className="grid gap-4">
            {jobs.map((job) => (
              <article key={job.id} className="admin-card space-y-5 px-6 py-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-[0.68rem] uppercase tracking-[0.28em] ${jobStatusClass(job.status)}`}
                      >
                        {job.status}
                      </span>
                      <span className="glass-chip px-3 py-1 text-[0.68rem] uppercase tracking-[0.28em] text-white">
                        {job.trigger}
                      </span>
                      {job.adapterId ? (
                        <span className="glass-chip px-3 py-1 text-[0.68rem] uppercase tracking-[0.28em] text-white">
                          {job.adapterId}
                        </span>
                      ) : null}
                      {job.cleanupMode ? (
                        <span className="glass-chip px-3 py-1 text-[0.68rem] uppercase tracking-[0.28em] text-white">
                          Cleanup: {job.cleanupMode}
                        </span>
                      ) : null}
                    </div>

                    <div className="space-y-1">
                      <h3 className="text-xl text-white">
                        {job.event?.title ?? job.eventSlug ?? "Imported event"}
                      </h3>
                      <p className="text-sm text-white/54">
                        {job.sourcePrefix ?? "imports/"} · {job.fileCount} items
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {job.event ? (
                      <Link
                        href={`/admin/events/${job.event.id}`}
                        className="rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-white/72"
                      >
                        Open event
                      </Link>
                    ) : null}
                    {job.itemCounts.failed > 0 ? (
                      <button
                        type="button"
                        onClick={() => void retryImportJob(job.id)}
                        disabled={pendingAction !== null || job.status === "RUNNING"}
                        className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
                      >
                        {pendingAction === `retry-job:${job.id}`
                          ? "Queueing..."
                          : "Retry failed items"}
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-3 text-sm text-white/58 md:grid-cols-2 xl:grid-cols-5">
                  <div>
                    <p className="text-[0.68rem] uppercase tracking-[0.24em] text-white/40">
                      Complete
                    </p>
                    <p className="mt-2 text-white/78">{job.itemCounts.complete}</p>
                  </div>
                  <div>
                    <p className="text-[0.68rem] uppercase tracking-[0.24em] text-white/40">
                      Failed
                    </p>
                    <p className="mt-2 text-white/78">{job.itemCounts.failed}</p>
                  </div>
                  <div>
                    <p className="text-[0.68rem] uppercase tracking-[0.24em] text-white/40">
                      Skipped
                    </p>
                    <p className="mt-2 text-white/78">{job.itemCounts.skipped}</p>
                  </div>
                  <div>
                    <p className="text-[0.68rem] uppercase tracking-[0.24em] text-white/40">
                      Requested
                    </p>
                    <p className="mt-2 text-white/78">
                      {job.requestedBy?.displayName ?? "Webhook / system"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[0.68rem] uppercase tracking-[0.24em] text-white/40">
                      Updated
                    </p>
                    <p className="mt-2 text-white/78">
                      {formatDateTime(job.finishedAt ?? job.createdAt)}
                    </p>
                  </div>
                </div>

                {job.sourcePathExample ? (
                  <p className="rounded-2xl border border-white/8 bg-black/25 px-4 py-3 text-sm text-white/58">
                    Example source key:{" "}
                    <span className="break-all text-white/74">{job.sourcePathExample}</span>
                  </p>
                ) : null}

                {job.errorMessage ? (
                  <p className="rounded-2xl border border-[#c5965c]/30 bg-[#c5965c]/10 px-4 py-3 text-sm whitespace-pre-line text-[#f3d1aa]">
                    {job.errorMessage}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="admin-card px-6 py-10 text-center text-sm text-white/58">
            No storage import jobs match the current filters.
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <p className="editorial-label">Items</p>
          <h2 className="mt-2 font-serif text-[1.85rem] tracking-[-0.03em] text-white">
            Files
          </h2>
        </div>

        {items.length ? (
          <div className="grid gap-4">
            {items.map((item) => (
              <article key={item.id} className="admin-card space-y-5 px-6 py-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-[0.68rem] uppercase tracking-[0.28em] ${itemStatusClass(item.status)}`}
                      >
                        {item.status}
                      </span>
                      <span className="glass-chip px-3 py-1 text-[0.68rem] uppercase tracking-[0.28em] text-white">
                        {item.trigger}
                      </span>
                      <span className={cleanupClass(item.cleanupStatus)}>
                        Cleanup: {item.cleanupStatus.replaceAll("_", " ")}
                      </span>
                      {item.dismissedAt ? (
                        <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[0.68rem] uppercase tracking-[0.28em] text-white/64">
                          Dismissed
                        </span>
                      ) : null}
                    </div>

                    <div className="space-y-1">
                      <h3 className="text-base text-white">{item.sourceFilename}</h3>
                      <p className="break-all text-sm text-white/54">{item.sourceKey}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {item.event ? (
                      <Link
                        href={`/admin/events/${item.event.id}`}
                        className="rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-white/72"
                      >
                        Event
                      </Link>
                    ) : null}
                    {item.photo ? (
                      <Link
                        href={`/p/${item.photo.id}`}
                        className="rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-white/72"
                      >
                        Photo
                      </Link>
                    ) : null}
                    {item.status === "FAILED" ? (
                      <button
                        type="button"
                        onClick={() => void retryImportItem(item.id)}
                        disabled={pendingAction !== null}
                        className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
                      >
                        {pendingAction === `retry-item:${item.id}`
                          ? "Queueing..."
                          : "Retry item"}
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-3 text-sm text-white/58 md:grid-cols-2 xl:grid-cols-6">
                  <div>
                    <p className="text-[0.68rem] uppercase tracking-[0.24em] text-white/40">
                      Event slug
                    </p>
                    <p className="mt-2 text-white/78">{item.eventSlug}</p>
                  </div>
                  <div>
                    <p className="text-[0.68rem] uppercase tracking-[0.24em] text-white/40">
                      Size
                    </p>
                    <p className="mt-2 text-white/78">
                      {formatBytes(item.sourceByteSize) ?? "Unknown"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[0.68rem] uppercase tracking-[0.24em] text-white/40">
                      Job
                    </p>
                    <p className="mt-2 text-white/78">
                      {compactId(item.importJob.id)} · {item.importJob.status}
                    </p>
                  </div>
                  <div>
                    <p className="text-[0.68rem] uppercase tracking-[0.24em] text-white/40">
                      Started
                    </p>
                    <p className="mt-2 text-white/78">{formatDateTime(item.startedAt)}</p>
                  </div>
                  <div>
                    <p className="text-[0.68rem] uppercase tracking-[0.24em] text-white/40">
                      Completed
                    </p>
                    <p className="mt-2 text-white/78">
                      {item.completedAt ? formatDateTime(item.completedAt) : "In progress"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[0.68rem] uppercase tracking-[0.24em] text-white/40">
                      Hash
                    </p>
                    <p className="mt-2 text-white/78">{formatHash(item.contentHashSha256)}</p>
                  </div>
                </div>

                <div className="grid gap-3 text-sm text-white/58 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <p className="text-[0.68rem] uppercase tracking-[0.24em] text-white/40">
                      Provider
                    </p>
                    <p className="mt-2 text-white/78">{item.sourceProvider ?? "Unknown"}</p>
                  </div>
                  <div>
                    <p className="text-[0.68rem] uppercase tracking-[0.24em] text-white/40">
                      ETag
                    </p>
                    <p className="mt-2 break-all text-white/78">
                      {item.sourceEtag ?? "Not supplied"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[0.68rem] uppercase tracking-[0.24em] text-white/40">
                      Version
                    </p>
                    <p className="mt-2 break-all text-white/78">
                      {item.sourceVersion ?? "Not supplied"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[0.68rem] uppercase tracking-[0.24em] text-white/40">
                      Source modified
                    </p>
                    <p className="mt-2 text-white/78">
                      {formatRelativeState(item.sourceLastModified)}
                    </p>
                  </div>
                </div>

                {item.cleanupTargetKey ? (
                  <p className="rounded-2xl border border-white/8 bg-black/25 px-4 py-3 text-sm text-white/58">
                    Cleanup target:{" "}
                    <span className="break-all text-white/74">{item.cleanupTargetKey}</span>
                  </p>
                ) : null}

                {item.skipReason ? (
                  <p className="rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-white/64">
                    {item.skipReason}
                  </p>
                ) : null}

                {item.errorMessage || item.cleanupError ? (
                  <p className="rounded-2xl border border-[#c5965c]/30 bg-[#c5965c]/10 px-4 py-3 text-sm whitespace-pre-line text-[#f3d1aa]">
                    {item.errorMessage ?? item.cleanupError}
                  </p>
                ) : null}

                {item.possibleDuplicates.length ? (
                  <div className="rounded-3xl border border-white/8 bg-black/25 px-4 py-4">
                    <p className="editorial-label">Possible duplicates</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-sm text-white/62">
                      {item.possibleDuplicates.map((duplicate) => (
                        <span
                          key={duplicate.id}
                          className="rounded-full border border-white/10 bg-white/4 px-3 py-1"
                        >
                          {duplicate.event ? (
                            <Link href={`/admin/events/${duplicate.event.id}`}>
                              {duplicate.event.slug}
                            </Link>
                          ) : (
                            duplicate.eventSlug
                          )}
                          {duplicate.photo ? (
                            <>
                              {" "}
                              · <Link href={`/p/${duplicate.photo.id}`}>{duplicate.photo.id}</Link>
                            </>
                          ) : null}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                <details className="rounded-3xl border border-white/8 bg-black/25 px-4 py-4">
                  <summary className="cursor-pointer list-none text-sm text-white/78">
                    Timeline and lifecycle
                  </summary>
                  <div className="mt-4 space-y-3">
                    {item.timeline.length ? (
                      item.timeline.map((event) => (
                        <div
                          key={event.id}
                          className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-sm text-white">{event.label}</p>
                            <p className="text-xs uppercase tracking-[0.24em] text-white/40">
                              {formatDateTime(event.createdAt)}
                            </p>
                          </div>
                          <p className="mt-2 text-xs uppercase tracking-[0.22em] text-white/36">
                            {event.eventType}
                          </p>
                          {event.detail ? (
                            <p className="mt-2 break-all text-sm text-white/56">
                              {event.detail}
                            </p>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-white/54">
                        No timeline events were recorded for this item yet.
                      </p>
                    )}
                  </div>
                </details>
              </article>
            ))}
          </div>
        ) : (
          <div className="admin-card px-6 py-10 text-center text-sm text-white/58">
            No import items match the current filters.
          </div>
        )}
      </section>
    </div>
  );
}
