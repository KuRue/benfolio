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
import { getStorageBuckets, deleteObjects, extensionFromFilename, uploadObject } from "@/lib/storage";
import {
  clearAppSettingsCache,
  defaultAppSettingsValues,
} from "@/lib/app-settings";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/strings";
import { storeSiteProfileImage } from "@/lib/admin-photo-operations";

export type AuthActionState = {
  error?: string;
};

export type EventActionState = {
  error?: string;
  fieldErrors?: Partial<Record<"title" | "slug", string>>;
};

export type SiteProfileActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Partial<Record<"displayName", string>>;
};

export type AppSettingsActionState = {
  error?: string;
  success?: string;
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

function asBoolean(value: FormDataEntryValue | null) {
  return value === "on" || value === "true";
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

function normalizeOptionalUrl(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const candidate = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(candidate);

    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function normalizePercent(value: FormDataEntryValue | null, fallback = 50) {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(100, Math.max(0, parsed));
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
  const buckets = await getStorageBuckets();
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
      bucket: buckets.originals,
      key: originalKey,
      body: buffer,
      contentType: file.type || "application/octet-stream",
      cacheControl: "private, max-age=0, no-store",
    }),
    uploadObject({
      bucket: buckets.derivatives,
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

function normalizeOptionalSettingValue(value: string) {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

async function getValidatedEventPayload(
  formData: FormData,
  currentEventId?: string,
) {
  const title = asString(formData.get("title"));
  const slugInput = asString(formData.get("slug"));
  const location = asString(formData.get("location")) || null;
  const description = asString(formData.get("description")) || null;
  const visibility = asVisibility(asString(formData.get("visibility")));
  const slug = slugify(slugInput || title);

  const fieldErrors: EventActionState["fieldErrors"] = {};

  if (!title) {
    fieldErrors.title = "Title is required.";
  }

  if (!slug) {
    fieldErrors.slug = "Slug is required.";
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
  const linkUrlInput = asString(formData.get("linkUrl"));
  const headline =
    asString(formData.get("headline")) ||
    "Event photography arranged with the feel of the original night.";
  const bio =
    asString(formData.get("bio")) ||
    "A mobile-first archive for event coverage, client galleries, and private releases.";
  const coverFocalX = normalizePercent(formData.get("coverFocalX"));
  const coverFocalY = normalizePercent(formData.get("coverFocalY"));
  const websiteUrl = normalizeOptionalUrl(linkUrlInput);

  if (linkUrlInput && !websiteUrl) {
    return {
      error: "Link must be a valid http(s) URL.",
    };
  }

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
      websiteUrl,
      instagramUrl: null,
      coverFocalX,
      coverFocalY,
    },
    create: {
      id: "default",
      displayName,
      handle,
      headline,
      bio,
      websiteUrl,
      instagramUrl: null,
      coverFocalX,
      coverFocalY,
    },
  });

  const heroFile = formData.get("heroImage");
  const avatarFile = formData.get("avatarImage");
  const logoFile = formData.get("logoImage");

  if (heroFile instanceof File && heroFile.size > 0) {
    await storeSiteProfileImage("cover", heroFile);
  }

  if (avatarFile instanceof File && avatarFile.size > 0) {
    await storeSiteProfileImage("avatar", avatarFile);
  }

  if (logoFile instanceof File && logoFile.size > 0) {
    await storeSiteProfileImage("logo", logoFile);
  }

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/settings");

  return {
    success: "Homepage profile updated.",
  };
}

export async function updateAppSettingsAction(
  _previousState: AppSettingsActionState,
  formData: FormData,
): Promise<AppSettingsActionState> {
  await requireAdmin();

  const storageEndpointInput = asString(formData.get("storageEndpoint"));
  const storagePublicEndpointInput = asString(formData.get("storagePublicEndpoint"));
  const storageEndpoint =
    storageEndpointInput ? normalizeOptionalUrl(storageEndpointInput) : null;
  const storagePublicEndpoint = storagePublicEndpointInput
    ? normalizeOptionalUrl(storagePublicEndpointInput)
    : null;

  if (storageEndpointInput && !storageEndpoint) {
    return {
      error: "Storage endpoint must be a valid http(s) URL.",
    };
  }

  if (storagePublicEndpointInput && !storagePublicEndpoint) {
    return {
      error: "Public endpoint must be a valid http(s) URL.",
    };
  }

  const importsCleanupMode = asString(formData.get("importsCleanupMode"));
  const cleanupMode =
    importsCleanupMode === "archive" || importsCleanupMode === "delete"
      ? importsCleanupMode
      : defaultAppSettingsValues.importsCleanupMode;

  await prisma.appSettings.upsert({
    where: {
      id: "default",
    },
    update: {
      storageProviderLabel: normalizeOptionalSettingValue(
        asString(formData.get("storageProviderLabel")),
      ),
      storageEndpoint,
      storagePublicEndpoint,
      storageRegion: normalizeOptionalSettingValue(asString(formData.get("storageRegion"))),
      storageForcePathStyle: asBoolean(formData.get("storageForcePathStyle")),
      storageOriginalsBucket: normalizeOptionalSettingValue(
        asString(formData.get("storageOriginalsBucket")),
      ),
      storageDerivativesBucket: normalizeOptionalSettingValue(
        asString(formData.get("storageDerivativesBucket")),
      ),
      importsPrefix: normalizeOptionalSettingValue(asString(formData.get("importsPrefix"))),
      importsCleanupMode: cleanupMode,
      importsArchivePrefix: normalizeOptionalSettingValue(
        asString(formData.get("importsArchivePrefix")),
      ),
      publicSearchEnabled: asBoolean(formData.get("publicSearchEnabled")),
      downloadsEnabled: asBoolean(formData.get("downloadsEnabled")),
      allowPublicIndexing: asBoolean(formData.get("allowPublicIndexing")),
      defaultEventVisibility: asVisibility(
        asString(formData.get("defaultEventVisibility")),
      ),
      directUploadEnabled: asBoolean(formData.get("directUploadEnabled")),
      logoMarkEnabled: asBoolean(formData.get("logoMarkEnabled")),
    },
    create: {
      id: "default",
      storageProviderLabel: normalizeOptionalSettingValue(
        asString(formData.get("storageProviderLabel")),
      ),
      storageEndpoint,
      storagePublicEndpoint,
      storageRegion: normalizeOptionalSettingValue(asString(formData.get("storageRegion"))),
      storageForcePathStyle: asBoolean(formData.get("storageForcePathStyle")),
      storageOriginalsBucket: normalizeOptionalSettingValue(
        asString(formData.get("storageOriginalsBucket")),
      ),
      storageDerivativesBucket: normalizeOptionalSettingValue(
        asString(formData.get("storageDerivativesBucket")),
      ),
      importsPrefix: normalizeOptionalSettingValue(asString(formData.get("importsPrefix"))),
      importsCleanupMode: cleanupMode,
      importsArchivePrefix: normalizeOptionalSettingValue(
        asString(formData.get("importsArchivePrefix")),
      ),
      publicSearchEnabled: asBoolean(formData.get("publicSearchEnabled")),
      downloadsEnabled: asBoolean(formData.get("downloadsEnabled")),
      allowPublicIndexing: asBoolean(formData.get("allowPublicIndexing")),
      defaultEventVisibility: asVisibility(
        asString(formData.get("defaultEventVisibility")),
      ),
      directUploadEnabled: asBoolean(formData.get("directUploadEnabled")),
      logoMarkEnabled: asBoolean(formData.get("logoMarkEnabled")),
    },
  });

  clearAppSettingsCache();

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/settings");
  revalidatePath("/admin/uploads");
  revalidatePath("/admin/imports");
  revalidatePath("/sitemap.xml");
  revalidatePath("/robots.txt");

  return {
    success: "Operational settings updated.",
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
      eventDate: new Date(),
      eventEndDate: null,
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
  const buckets = await getStorageBuckets();

  await Promise.all([
    deleteObjects({ bucket: buckets.originals, keys: originalKeys }),
    deleteObjects({ bucket: buckets.derivatives, keys: derivativeKeys }),
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
