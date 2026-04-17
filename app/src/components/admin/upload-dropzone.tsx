"use client";

import { useMemo, useRef, useState } from "react";

import { browserPhotoInputAccept } from "@/lib/photo-files";

type UploadDropzoneProps = {
  directUploadEnabled: boolean;
  defaultVisibility: "DRAFT" | "HIDDEN" | "PUBLIC";
  events: Array<{
    id: string;
    title: string;
    slug: string;
    eventDateLabel: string;
    visibility: "DRAFT" | "HIDDEN" | "PUBLIC";
  }>;
};

type UploadStatus =
  | "pending"
  | "preparing"
  | "uploading"
  | "uploaded"
  | "registering"
  | "queued"
  | "failed";

type UploadItem = {
  clientId: string;
  file: File;
  status: UploadStatus;
  progress: number;
  error: string | null;
  photoId: string | null;
};

type PreparedUpload = {
  clientId: string;
  photoId: string;
  originalKey: string;
  originalFilename: string;
  originalMimeType: string;
  originalByteSize: number;
  uploadMethod: "PUT";
  uploadUrl: string;
  uploadHeaders: Record<string, string>;
};

type PrepareUploadResponse = {
  importJobId: string;
  eventId: string;
  eventSlug: string;
  files: PreparedUpload[];
};

type CompleteUploadResponse = {
  status: "SUCCEEDED" | "FAILED";
  eventId: string;
  eventSlug: string;
  queuedCount: number;
  alreadyRegisteredCount: number;
  failedCount: number;
  failures: Array<{
    clientId: string;
    error: string;
  }>;
  message: string;
};

const directUploadConcurrency = 3;

function createUploadItems(incoming: FileList | File[]) {
  return Array.from(incoming).map<UploadItem>((file) => ({
    clientId: crypto.randomUUID(),
    file,
    status: "pending",
    progress: 0,
    error: null,
    photoId: null,
  }));
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${bytes} B`;
}

function buildStatusLabel(status: UploadStatus) {
  switch (status) {
    case "preparing":
      return "Signing";
    case "uploading":
      return "Uploading";
    case "uploaded":
      return "Uploaded";
    case "registering":
      return "Queueing";
    case "queued":
      return "Queued";
    case "failed":
      return "Failed";
    default:
      return "Ready";
  }
}

function buildStatusClasses(status: UploadStatus) {
  switch (status) {
    case "queued":
      return "border-emerald-400/25 bg-emerald-400/8 text-emerald-100";
    case "failed":
      return "border-[#c5965c]/30 bg-[#c5965c]/10 text-[#f3d1aa]";
    case "uploading":
    case "registering":
    case "uploaded":
    case "preparing":
      return "border-white/12 bg-white/8 text-white";
    default:
      return "border-white/10 bg-white/4 text-white/72";
  }
}

function uploadFileToSignedTarget(args: {
  file: File;
  target: PreparedUpload;
  onProgress: (progress: number) => void;
}) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.open(args.target.uploadMethod, args.target.uploadUrl, true);

    for (const [header, value] of Object.entries(args.target.uploadHeaders)) {
      request.setRequestHeader(header, value);
    }

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) {
        return;
      }

      args.onProgress(Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100))));
    };

    request.onerror = () => {
      // onerror fires when no HTTP response reached the browser — almost always a CORS
      // preflight failure, DNS/connection issue, or mixed-content block. Log the target
      // URL so the admin can inspect the storage-side response in devtools Network tab.
      // eslint-disable-next-line no-console
      console.error("Direct upload failed (no response)", {
        filename: args.file.name,
        method: args.target.uploadMethod,
        url: args.target.uploadUrl,
        hint: "Check the storage bucket CORS policy and that S3_PUBLIC_ENDPOINT is browser-reachable.",
      });
      reject(
        new Error(
          `Could not reach storage for ${args.file.name}. Likely a CORS or endpoint issue — see devtools console for the target URL.`,
        ),
      );
    };

    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        args.onProgress(100);
        resolve();
        return;
      }

      // Storage (S3/R2) returns useful XML in the body on rejection — surface it.
      const bodySnippet = (request.responseText || "").slice(0, 300);
      // eslint-disable-next-line no-console
      console.error("Storage rejected direct upload", {
        filename: args.file.name,
        status: request.status,
        url: args.target.uploadUrl,
        body: bodySnippet,
      });
      reject(
        new Error(
          `Storage upload failed for ${args.file.name} (${request.status}). ${bodySnippet ? "See devtools console for details." : ""}`.trim(),
        ),
      );
    };

    request.send(args.file);
  });
}

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
) {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const taskIndex = nextIndex;
      nextIndex += 1;
      results[taskIndex] = await tasks[taskIndex]!();
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()),
  );

  return results;
}

export function UploadDropzone({
  directUploadEnabled,
  defaultVisibility,
  events,
}: UploadDropzoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [mode, setMode] = useState<"existing" | "create">(
    events.length ? "existing" : "create",
  );
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventSlug, setNewEventSlug] = useState("");
  const [newEventLocation, setNewEventLocation] = useState("");
  const [newEventDescription, setNewEventDescription] = useState("");
  const [newEventVisibility, setNewEventVisibility] =
    useState<"DRAFT" | "HIDDEN" | "PUBLIC">(defaultVisibility);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalBytes = useMemo(
    () => uploadItems.reduce((sum, item) => sum + item.file.size, 0),
    [uploadItems],
  );
  const queuedCount = useMemo(
    () => uploadItems.filter((item) => item.status === "queued").length,
    [uploadItems],
  );
  const failedCount = useMemo(
    () => uploadItems.filter((item) => item.status === "failed").length,
    [uploadItems],
  );
  const activeCount = useMemo(
    () =>
      uploadItems.filter((item) =>
        ["preparing", "uploading", "uploaded", "registering"].includes(item.status),
      ).length,
    [uploadItems],
  );
  const averageProgress = useMemo(() => {
    if (!uploadItems.length) {
      return 0;
    }

    return Math.round(
      uploadItems.reduce((sum, item) => sum + item.progress, 0) / uploadItems.length,
    );
  }, [uploadItems]);

  function replaceUploadItems(incoming: FileList | null) {
    if (!incoming) {
      return;
    }

    setUploadItems(createUploadItems(incoming));
    setMessage(null);
    setError(null);
  }

  function patchUploadItem(
    clientId: string,
    updater: (item: UploadItem) => UploadItem,
  ) {
    setUploadItems((current) =>
      current.map((item) => (item.clientId === clientId ? updater(item) : item)),
    );
  }

  async function handleSubmit() {
    const pendingItems = uploadItems.filter((item) => item.status !== "queued");

    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      if (!pendingItems.length) {
        throw new Error("Add at least one photo.");
      }

      if (!directUploadEnabled) {
        throw new Error("Direct uploads are disabled in settings.");
      }

      const prepareResponse = await fetch("/api/admin/uploads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode,
          eventId,
          title: newEventTitle,
          slug: newEventSlug,
          location: newEventLocation,
          description: newEventDescription,
          visibility: newEventVisibility,
          files: pendingItems.map((item) => ({
            clientId: item.clientId,
            name: item.file.name,
            size: item.file.size,
            type: item.file.type || "application/octet-stream",
            lastModified: item.file.lastModified || null,
          })),
        }),
      });

      const preparePayload = (await prepareResponse.json()) as
        | PrepareUploadResponse
        | {
            error?: string;
          };
      const prepareError =
        "error" in preparePayload ? preparePayload.error : undefined;

      if (!prepareResponse.ok || !("files" in preparePayload)) {
        throw new Error(prepareError ?? "Could not prepare uploads.");
      }

      const targets = new Map(
        preparePayload.files.map((file) => [file.clientId, file]),
      );

      setUploadItems((current) =>
        current.map((item) =>
          targets.has(item.clientId)
            ? {
                ...item,
                status: "preparing",
                progress: 0,
                error: null,
                photoId: targets.get(item.clientId)?.photoId ?? null,
              }
            : item,
        ),
      );

      const uploadResults = await runWithConcurrency(
        pendingItems.map((item) => async () => {
          const target = targets.get(item.clientId);

          if (!target) {
            throw new Error(`Missing upload target for ${item.file.name}.`);
          }

          patchUploadItem(item.clientId, (current) => ({
            ...current,
            status: "uploading",
            progress: current.progress > 0 ? current.progress : 1,
            error: null,
            photoId: target.photoId,
          }));

          try {
            await uploadFileToSignedTarget({
              file: item.file,
              target,
              onProgress: (progress) => {
                patchUploadItem(item.clientId, (current) =>
                  current.progress === progress
                    ? current
                    : {
                        ...current,
                        status: "uploading",
                        progress,
                      },
                );
              },
            });

            patchUploadItem(item.clientId, (current) => ({
              ...current,
              status: "uploaded",
              progress: 100,
              error: null,
              photoId: target.photoId,
            }));

            return {
              clientId: item.clientId,
              ok: true as const,
            };
          } catch (caughtError) {
            const message =
              caughtError instanceof Error
                ? caughtError.message
                : `Upload failed for ${item.file.name}.`;

            patchUploadItem(item.clientId, (current) => ({
              ...current,
              status: "failed",
              progress: 0,
              error: message,
            }));

            return {
              clientId: item.clientId,
              ok: false as const,
              error: message,
            };
          }
        }),
        directUploadConcurrency,
      );

      const uploadedClientIds = uploadResults
        .filter((result) => result.ok)
        .map((result) => result.clientId);
      const failedUploads = uploadResults
        .filter((result) => !result.ok)
        .map((result) => ({
          clientId: result.clientId,
          error: result.error,
        }));

      if (!uploadedClientIds.length) {
        throw new Error("No files finished uploading. Fix the failed uploads and try again.");
      }

      setUploadItems((current) =>
        current.map((item) =>
          uploadedClientIds.includes(item.clientId)
            ? {
                ...item,
                status: "registering",
                progress: 100,
              }
            : item,
        ),
      );

      const completeResponse = await fetch("/api/admin/uploads/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          importJobId: preparePayload.importJobId,
          uploadedClientIds,
          failedUploads,
        }),
      });

      const completePayload = (await completeResponse.json()) as
        | CompleteUploadResponse
        | {
            error?: string;
          };
      const completeError =
        "error" in completePayload ? completePayload.error : undefined;

      if (!completeResponse.ok || !("failures" in completePayload)) {
        throw new Error(completeError ?? "Could not queue uploaded photos.");
      }

      const failureMap = new Map(
        completePayload.failures.map((failure) => [failure.clientId, failure.error]),
      );

      setUploadItems((current) =>
        current.map((item) => {
          if (failureMap.has(item.clientId)) {
            return {
              ...item,
              status: "failed",
              progress: 0,
              error: failureMap.get(item.clientId) ?? "Upload failed.",
            };
          }

          if (uploadedClientIds.includes(item.clientId)) {
            return {
              ...item,
              status: "queued",
              progress: 100,
              error: null,
            };
          }

          return item;
        }),
      );

      setMessage(
        completePayload.failedCount
          ? `${completePayload.message} ${completePayload.failedCount} files still need attention before they can be queued.`
          : completePayload.message,
      );

      if (completePayload.failedCount) {
        setError("Some files failed to upload or verify. Fix them and upload again.");
      } else if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Upload failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-6">
        <div className="space-y-2">
          <p className="editorial-label">Upload</p>
        <h1 className="font-serif text-4xl tracking-[-0.03em] text-white">
          Multi-file ingest.
        </h1>
        <p className="max-w-2xl text-sm leading-7 text-white/58">
          Sign direct browser uploads into private object storage, then let the
          worker extract EXIF data and generate derivatives in the background.
        </p>
      </div>

      <div className="admin-card space-y-6 px-6 py-6">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode("existing")}
            className={`rounded-full px-4 py-2 text-sm ${
              mode === "existing"
                ? "bg-white text-black"
                : "border border-white/10 bg-white/4 text-white/68"
            }`}
          >
            Attach to existing event
          </button>
          <button
            type="button"
            onClick={() => setMode("create")}
            className={`rounded-full px-4 py-2 text-sm ${
              mode === "create"
                ? "bg-white text-black"
                : "border border-white/10 bg-white/4 text-white/68"
            }`}
          >
            Create event during upload
          </button>
        </div>

      {!directUploadEnabled ? (
        <p className="rounded-2xl border border-[#c5965c]/30 bg-[#c5965c]/10 px-4 py-3 text-sm text-[#f3d1aa]">
          Direct uploads are disabled in settings.
        </p>
      ) : null}

        {mode === "existing" ? (
          <label className="block space-y-2">
            <span className="text-sm text-white/68">Event</span>
            <select
              value={eventId}
              onChange={(event) => setEventId(event.target.value)}
              className="admin-select"
            >
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title} · {event.eventDateLabel} · {event.visibility}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="block space-y-2 lg:col-span-2">
              <span className="text-sm text-white/68">Title</span>
              <input
                value={newEventTitle}
                onChange={(event) => setNewEventTitle(event.target.value)}
                className="admin-input"
                placeholder="Autumn portrait night"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm text-white/68">Slug</span>
              <input
                value={newEventSlug}
                onChange={(event) => setNewEventSlug(event.target.value)}
                className="admin-input"
                placeholder="autumn-portrait-night"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm text-white/68">Location</span>
              <input
                value={newEventLocation}
                onChange={(event) => setNewEventLocation(event.target.value)}
                className="admin-input"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm text-white/68">Visibility</span>
              <select
                value={newEventVisibility}
                onChange={(event) =>
                  setNewEventVisibility(
                    event.target.value as "DRAFT" | "HIDDEN" | "PUBLIC",
                  )
                }
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
                value={newEventDescription}
                onChange={(event) => setNewEventDescription(event.target.value)}
                className="admin-textarea"
              />
            </label>
            <p className="text-sm text-white/48 lg:col-span-2">
              Event dates will come from the uploaded photo timeline.
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            replaceUploadItems(event.dataTransfer.files);
          }}
          disabled={!directUploadEnabled}
          className="flex min-h-52 w-full flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-white/15 bg-white/3 px-6 py-10 text-center disabled:cursor-not-allowed disabled:opacity-50"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={browserPhotoInputAccept}
            multiple
            hidden
            onChange={(event) => replaceUploadItems(event.target.files)}
          />
          <span className="font-serif text-3xl text-white">Drop photos here</span>
          <span className="mt-3 text-sm text-white/56">
            or tap to sign direct uploads into private storage, including DNG and ARW
          </span>
        </button>

        <div className="rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-white/56">
            <span>{uploadItems.length} files selected</span>
            <span>{formatBytes(totalBytes)} total</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.3em] text-white/42">
                Active
              </p>
              <p className="mt-2 text-xl text-white">{activeCount}</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.3em] text-white/42">
                Queued
              </p>
              <p className="mt-2 text-xl text-white">{queuedCount}</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.3em] text-white/42">
                Failed
              </p>
              <p className="mt-2 text-xl text-white">{failedCount}</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.3em] text-white/42">
                Progress
              </p>
              <p className="mt-2 text-xl text-white">{averageProgress}%</p>
            </div>
          </div>
        </div>

        {uploadItems.length ? (
          <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
            {uploadItems.map((item) => (
              <article
                key={item.clientId}
                className={`rounded-[1.25rem] border px-4 py-4 ${buildStatusClasses(item.status)}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">
                      {item.file.name}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-white/52">
                      <span>{formatBytes(item.file.size)}</span>
                      <span>{buildStatusLabel(item.status)}</span>
                      {item.photoId ? <span>Photo {item.photoId}</span> : null}
                    </div>
                  </div>
                  <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-white/60">
                    {item.progress}%
                  </span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-white/8">
                  <div
                    className={`h-full rounded-full transition-[width] duration-300 ${
                      item.status === "failed"
                        ? "bg-[#c5965c]"
                        : item.status === "queued"
                          ? "bg-emerald-300"
                          : "bg-white"
                    }`}
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
                {item.error ? (
                  <p className="mt-3 text-xs leading-6 text-[#f3d1aa]">
                    {item.error}
                  </p>
                ) : item.status === "queued" ? (
                  <p className="mt-3 text-xs leading-6 text-emerald-100/78">
                    Original stored privately. Processing is now running in the worker.
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}

        {message ? (
          <p className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
            {message}
          </p>
        ) : null}

        {error ? (
          <p className="rounded-2xl border border-[#c5965c]/30 bg-[#c5965c]/10 px-4 py-3 text-sm text-[#f3d1aa]">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy || !directUploadEnabled}
          className="rounded-full bg-white px-5 py-3 text-sm font-medium text-black disabled:opacity-60"
        >
          {busy ? "Uploading directly to storage..." : "Upload originals and queue processing"}
        </button>
      </div>
    </section>
  );
}
