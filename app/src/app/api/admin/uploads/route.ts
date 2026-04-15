import { Buffer } from "node:buffer";

import { NextResponse } from "next/server";

import { getCurrentAdmin } from "@/lib/auth";
import { enqueuePhotoProcessing } from "@/lib/queue";
import { generatePhotoId } from "@/lib/ids";
import { extensionFromFilename, storageBuckets, uploadObject } from "@/lib/storage";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/strings";

type EventVisibilityValue = "DRAFT" | "HIDDEN" | "PUBLIC";

function asString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

async function slugIsTaken(slug: string) {
  const existing = await prisma.event.findUnique({
    where: { slug },
    select: { id: true },
  });

  return Boolean(existing);
}

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (!files.length) {
    return NextResponse.json(
      { error: "Add at least one file before uploading." },
      { status: 400 },
    );
  }

  const mode = asString(formData.get("mode")) === "create" ? "create" : "existing";
  let eventId = asString(formData.get("eventId"));
  let eventSlug = "";

  if (mode === "create") {
    const title = asString(formData.get("title"));
    const slug = slugify(asString(formData.get("slug")) || title);
    const eventDateInput = asString(formData.get("eventDate"));
    const eventDate = eventDateInput ? new Date(eventDateInput) : null;
    const visibilityValue = asString(formData.get("visibility"));
    const visibility: EventVisibilityValue =
      visibilityValue === "PUBLIC" ||
      visibilityValue === "HIDDEN" ||
      visibilityValue === "DRAFT"
        ? visibilityValue
        : "DRAFT";

    if (!title || !slug || !eventDate || Number.isNaN(eventDate.getTime())) {
      return NextResponse.json(
        { error: "New events require a title, slug, and event date." },
        { status: 400 },
      );
    }

    if (await slugIsTaken(slug)) {
      return NextResponse.json(
        { error: "That slug is already in use." },
        { status: 400 },
      );
    }

    const event = await prisma.event.create({
      data: {
        title,
        slug,
        eventDate,
        location: asString(formData.get("location")) || null,
        description: asString(formData.get("description")) || null,
        visibility,
        publishedAt: visibility === "PUBLIC" ? new Date() : null,
      },
    });

    eventId = event.id;
    eventSlug = event.slug;
  } else {
    if (!eventId) {
      return NextResponse.json(
        { error: "Select an event before uploading." },
        { status: 400 },
      );
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { slug: true },
    });

    if (!event) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }

    eventSlug = event.slug;
  }

  const importJob = await prisma.importJob.create({
    data: {
      type: "MANUAL_UPLOAD",
      source: "MANUAL",
      status: "RUNNING",
      requestedById: admin.id,
      eventId,
      totalItems: files.length,
    },
  });

  try {
    const maxSortOrder = await prisma.photo.aggregate({
      where: { eventId },
      _max: { sortOrder: true },
    });

    let sortOrder = (maxSortOrder._max.sortOrder ?? -1) + 1;

    for (const file of files) {
      const photoId = generatePhotoId();
      const extension = extensionFromFilename(file.name);
      const originalKey = `events/${eventId}/photos/${photoId}/original.${extension}`;
      const buffer = Buffer.from(await file.arrayBuffer());

      await uploadObject({
        bucket: storageBuckets.originals,
        key: originalKey,
        body: buffer,
        contentType: file.type || "application/octet-stream",
        cacheControl: "private, max-age=0, no-store",
      });

      await prisma.photo.create({
        data: {
          id: photoId,
          eventId,
          originalKey,
          originalFilename: file.name,
          originalMimeType: file.type || "application/octet-stream",
          originalByteSize: BigInt(file.size),
          sortOrder,
        },
      });

      sortOrder += 1;

      await enqueuePhotoProcessing(photoId);
    }

    await prisma.importJob.update({
      where: { id: importJob.id },
      data: {
        status: "SUCCEEDED",
        processedItems: files.length,
        finishedAt: new Date(),
      },
    });

    return NextResponse.json({
      message: `Queued ${files.length} files for processing on /e/${eventSlug}.`,
    });
  } catch (error) {
    await prisma.importJob.update({
      where: { id: importJob.id },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Upload failed.",
        finishedAt: new Date(),
      },
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Upload failed.",
      },
      { status: 500 },
    );
  }
}
