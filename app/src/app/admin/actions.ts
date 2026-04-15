"use server";

import { Buffer } from "node:buffer";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import sharp from "sharp";

import {
  clearAdminSession,
  createAdminSession,
  hashPassword,
  hasAdminUsers,
  requireAdmin,
  verifyPassword,
} from "@/lib/auth";
import { deleteObjects, extensionFromFilename, storageBuckets, uploadObject } from "@/lib/storage";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/strings";
import { storeSiteProfileImage } from "@/lib/admin-photo-operations";

export type AuthActionState = {
  error?: string;
};

export type EventActionState = {
  error?: string;
  fieldErrors?: Partial<Record<"title" | "slug" | "eventDate", string>>;
};

export type SiteProfileActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Partial<Record<"displayName", string>>;
};

type EventVisibilityValue = "DRAFT" | "HIDDEN" | "PUBLIC";

function asString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function asVisibility(value: string): EventVisibilityValue {
  return value === "PUBLIC" || value === "HIDDEN" || value === "DRAFT"
    ? value
    : "DRAFT";
}

function normalizeHandle(value: string) {
  const normalized = value
    .trim()
    .replace(/^@+/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, 32)
    .toLowerCase();

  return normalized || null;
}

async function slugIsTaken(slug: string, excludeId?: string) {
  const existing = await prisma.event.findUnique({
    where: {
      slug,
    },
    select: {
      id: true,
    },
  });

  return Boolean(existing && existing.id !== excludeId);
}

async function storeEventCover(eventId: string, file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const originalExtension = extensionFromFilename(file.name);
  const originalKey = `events/${eventId}/cover/original.${originalExtension}`;
  const displayKey = `events/${eventId}/cover/display.webp`;

  const image = sharp(buffer).rotate();
  const metadata = await image.metadata();
  const displayBuffer = await image
    .clone()
    .resize({
      width: 1800,
      withoutEnlargement: true,
    })
    .webp({ quality: 84 })
    .toBuffer();

  await Promise.all([
    uploadObject({
      bucket: storageBuckets.originals,
      key: originalKey,
      body: buffer,
      contentType: file.type || "application/octet-stream",
      cacheControl: "private, max-age=0, no-store",
    }),
    uploadObject({
      bucket: storageBuckets.derivatives,
      key: displayKey,
      body: displayBuffer,
      contentType: "image/webp",
      cacheControl: "public, max-age=31536000, immutable",
    }),
  ]);

  return {
    coverOriginalKey: originalKey,
    coverDisplayKey: displayKey,
    coverWidth: metadata.width ?? null,
    coverHeight: metadata.height ?? null,
  };
}

async function getValidatedEventPayload(
  formData: FormData,
  currentEventId?: string,
) {
  const title = asString(formData.get("title"));
  const slugInput = asString(formData.get("slug"));
  const eventDateInput = asString(formData.get("eventDate"));
  const location = asString(formData.get("location")) || null;
  const description = asString(formData.get("description")) || null;
  const visibility = asVisibility(asString(formData.get("visibility")));
  const slug = slugify(slugInput || title);
  const eventDate = eventDateInput ? new Date(eventDateInput) : null;

  const fieldErrors: EventActionState["fieldErrors"] = {};

  if (!title) {
    fieldErrors.title = "Title is required.";
  }

  if (!slug) {
    fieldErrors.slug = "Slug is required.";
  }

  if (!eventDate || Number.isNaN(eventDate.getTime())) {
    fieldErrors.eventDate = "Event date is required.";
  }

  if (slug && (await slugIsTaken(slug, currentEventId))) {
    fieldErrors.slug = "Slug is already in use.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false as const,
      state: {
        error: "Please correct the highlighted fields.",
        fieldErrors,
      },
    };
  }

  return {
    ok: true as const,
    data: {
      title,
      slug,
      eventDate: eventDate as Date,
      location,
      description,
      visibility,
    },
  };
}

export async function loginAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = asString(formData.get("email")).toLowerCase();
  const password = asString(formData.get("password"));

  if (!(await hasAdminUsers())) {
    redirect("/admin/bootstrap");
  }

  const admin = await prisma.adminUser.findUnique({
    where: {
      email,
    },
  });

  if (!admin || !verifyPassword(password, admin.passwordHash)) {
    return { error: "Incorrect email or password." };
  }

  await prisma.adminUser.update({
    where: { id: admin.id },
    data: {
      lastLoginAt: new Date(),
    },
  });

  await createAdminSession(admin.id);
  redirect("/admin");
}

export async function bootstrapAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (await hasAdminUsers()) {
    redirect("/admin/login");
  }

  const displayName = asString(formData.get("displayName"));
  const email = asString(formData.get("email")).toLowerCase();
  const password = asString(formData.get("password"));

  if (!displayName || !email || password.length < 8) {
    return {
      error: "Name, email, and a password of at least 8 characters are required.",
    };
  }

  const admin = await prisma.adminUser.create({
    data: {
      displayName,
      email,
      passwordHash: hashPassword(password),
      lastLoginAt: new Date(),
    },
  });

  await createAdminSession(admin.id);
  redirect("/admin");
}

export async function logoutAction() {
  await clearAdminSession();
  redirect("/admin/login");
}

export async function updateSiteProfileAction(
  _previousState: SiteProfileActionState,
  formData: FormData,
): Promise<SiteProfileActionState> {
  await requireAdmin();

  const displayName = asString(formData.get("displayName"));
  const handle = normalizeHandle(asString(formData.get("handle")));
  const headline =
    asString(formData.get("headline")) ||
    "Event photography arranged with the feel of the original night.";
  const bio =
    asString(formData.get("bio")) ||
    "A mobile-first archive for event coverage, client galleries, and private releases.";

  if (!displayName) {
    return {
      error: "Display name is required.",
      fieldErrors: {
        displayName: "Display name is required.",
      },
    };
  }

  await prisma.siteProfile.upsert({
    where: { id: "default" },
    update: {
      displayName,
      handle,
      headline,
      bio,
    },
    create: {
      id: "default",
      displayName,
      handle,
      headline,
      bio,
    },
  });

  const heroFile = formData.get("heroImage");
  const avatarFile = formData.get("avatarImage");

  if (heroFile instanceof File && heroFile.size > 0) {
    await storeSiteProfileImage("cover", heroFile);
  }

  if (avatarFile instanceof File && avatarFile.size > 0) {
    await storeSiteProfileImage("avatar", avatarFile);
  }

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/settings");

  return {
    success: "Homepage profile updated.",
  };
}

export async function createEventAction(
  _previousState: EventActionState,
  formData: FormData,
): Promise<EventActionState> {
  await requireAdmin();

  const validated = await getValidatedEventPayload(formData);

  if (!validated.ok) {
    return validated.state;
  }

  const event = await prisma.event.create({
    data: {
      ...validated.data,
      publishedAt: validated.data.visibility === "PUBLIC" ? new Date() : null,
    },
  });

  const coverFile = formData.get("coverImage");

  if (coverFile instanceof File && coverFile.size > 0) {
    const cover = await storeEventCover(event.id, coverFile);
    await prisma.event.update({
      where: { id: event.id },
      data: cover,
    });
  }

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/events");
  redirect(`/admin/events/${event.id}`);
}

export async function updateEventAction(
  eventId: string,
  _previousState: EventActionState,
  formData: FormData,
): Promise<EventActionState> {
  await requireAdmin();

  const existing = await prisma.event.findUnique({
    where: { id: eventId },
  });

  if (!existing) {
    return { error: "Event not found." };
  }

  const validated = await getValidatedEventPayload(formData, eventId);

  if (!validated.ok) {
    return validated.state;
  }

  const coverFile = formData.get("coverImage");
  const updates: Record<string, unknown> = {
    ...validated.data,
  };

  if (
    validated.data.visibility === "PUBLIC" &&
    (existing.visibility === "DRAFT" || existing.visibility === "HIDDEN")
  ) {
    updates.publishedAt = existing.publishedAt ?? new Date();
  }

  if (coverFile instanceof File && coverFile.size > 0) {
    const cover = await storeEventCover(eventId, coverFile);
    Object.assign(updates, cover);
  }

  const updated = await prisma.event.update({
    where: { id: eventId },
    data: updates,
  });

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/events");
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/e/${existing.slug}`);
  revalidatePath(`/e/${updated.slug}`);

  return {};
}

export async function deleteEventAction(eventId: string) {
  await requireAdmin();

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      photos: {
        include: {
          derivatives: true,
        },
      },
    },
  });

  if (!event) {
    redirect("/admin/events");
  }

  const originalKeys = [
    ...event.photos.map((photo) => photo.originalKey),
    event.coverOriginalKey,
  ].filter(Boolean) as string[];

  const derivativeKeys = [
    ...event.photos.flatMap((photo) =>
      photo.derivatives.map((derivative) => derivative.storageKey),
    ),
    event.coverDisplayKey,
  ].filter(Boolean) as string[];

  await Promise.all([
    deleteObjects({ bucket: storageBuckets.originals, keys: originalKeys }),
    deleteObjects({ bucket: storageBuckets.derivatives, keys: derivativeKeys }),
  ]);

  const siteProfile = await prisma.siteProfile.findUnique({
    where: { id: "default" },
  });

  if (siteProfile) {
    const photoOriginalKeySet = new Set(event.photos.map((photo) => photo.originalKey));
    const photoDerivativeKeySet = new Set(
      event.photos.flatMap((photo) =>
        photo.derivatives.map((derivative) => derivative.storageKey),
      ),
    );

    const clearCover =
      photoOriginalKeySet.has(siteProfile.coverOriginalKey ?? "") ||
      photoDerivativeKeySet.has(siteProfile.coverDisplayKey ?? "");
    const clearAvatar =
      photoOriginalKeySet.has(siteProfile.avatarOriginalKey ?? "") ||
      photoDerivativeKeySet.has(siteProfile.avatarDisplayKey ?? "");

    if (clearCover || clearAvatar) {
      await prisma.siteProfile.update({
        where: { id: "default" },
        data: {
          ...(clearCover
            ? {
                coverOriginalKey: null,
                coverDisplayKey: null,
              }
            : {}),
          ...(clearAvatar
            ? {
                avatarOriginalKey: null,
                avatarDisplayKey: null,
              }
            : {}),
        },
      });
    }
  }

  await prisma.event.delete({
    where: { id: eventId },
  });

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/events");
  revalidatePath("/admin/settings");
  revalidatePath(`/e/${event.slug}`);
  redirect("/admin/events");
}
