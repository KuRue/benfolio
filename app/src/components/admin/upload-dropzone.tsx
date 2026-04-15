"use client";

import { useMemo, useRef, useState } from "react";

type UploadDropzoneProps = {
  events: Array<{
    id: string;
    title: string;
    slug: string;
    eventDate: string;
    visibility: "DRAFT" | "HIDDEN" | "PUBLIC";
  }>;
};

export function UploadDropzone({ events }: UploadDropzoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<"existing" | "create">(
    events.length ? "existing" : "create",
  );
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventSlug, setNewEventSlug] = useState("");
  const [newEventDate, setNewEventDate] = useState("");
  const [newEventLocation, setNewEventLocation] = useState("");
  const [newEventDescription, setNewEventDescription] = useState("");
  const [newEventVisibility, setNewEventVisibility] =
    useState<"DRAFT" | "HIDDEN" | "PUBLIC">("DRAFT");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalBytes = useMemo(
    () => files.reduce((sum, file) => sum + file.size, 0),
    [files],
  );

  function handleFiles(incoming: FileList | null) {
    if (!incoming) {
      return;
    }

    setFiles(Array.from(incoming));
  }

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      if (!files.length) {
        throw new Error("Add at least one photo.");
      }

      const formData = new FormData();

      files.forEach((file) => formData.append("files", file));
      formData.set("mode", mode);

      if (mode === "existing") {
        if (!eventId) {
          throw new Error("Select an event first.");
        }

        formData.set("eventId", eventId);
      } else {
        formData.set("title", newEventTitle);
        formData.set("slug", newEventSlug);
        formData.set("eventDate", newEventDate);
        formData.set("location", newEventLocation);
        formData.set("description", newEventDescription);
        formData.set("visibility", newEventVisibility);
      }

      const response = await fetch("/api/admin/uploads", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Upload failed.");
      }

      setMessage(payload.message ?? "Upload queued.");
      setFiles([]);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Upload failed.",
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
          Queue original uploads to object storage, then let the worker extract
          EXIF data and generate derivatives in the background.
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
                  {event.title} · {event.eventDate} · {event.visibility}
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
              <span className="text-sm text-white/68">Event date</span>
              <input
                type="date"
                value={newEventDate}
                onChange={(event) => setNewEventDate(event.target.value)}
                className="admin-input"
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
          </div>
        )}

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            handleFiles(event.dataTransfer.files);
          }}
          className="flex min-h-52 w-full flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-white/15 bg-white/3 px-6 py-10 text-center"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(event) => handleFiles(event.target.files)}
          />
          <span className="font-serif text-3xl text-white">Drop photos here</span>
          <span className="mt-3 text-sm text-white/56">
            or tap to choose multiple originals
          </span>
        </button>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm text-white/56">
            <span>{files.length} files selected</span>
            <span>{(totalBytes / 1024 / 1024).toFixed(1)} MB total</span>
          </div>
          {files.length ? (
            <ul className="space-y-2 text-sm text-white/72">
              {files.slice(0, 8).map((file) => (
                <li key={`${file.name}-${file.size}`} className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
                  {file.name}
                </li>
              ))}
              {files.length > 8 ? (
                <li className="text-white/44">+ {files.length - 8} more files</li>
              ) : null}
            </ul>
          ) : null}
        </div>

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
          disabled={busy}
          className="rounded-full bg-white px-5 py-3 text-sm font-medium text-black disabled:opacity-60"
        >
          {busy ? "Uploading..." : "Upload originals and queue processing"}
        </button>
      </div>
    </section>
  );
}
