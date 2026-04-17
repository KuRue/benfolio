const MIME_BY_EXTENSION: Record<string, string> = {
  arw: "image/x-sony-arw",
  avif: "image/avif",
  dng: "image/x-adobe-dng",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  tif: "image/tiff",
  tiff: "image/tiff",
  webp: "image/webp",
};

const RAW_EXTENSIONS = new Set(["arw", "dng"]);
const RAW_MIME_TYPES = new Set(["image/x-adobe-dng", "image/x-sony-arw"]);

export const browserPhotoInputAccept = [
  "image/*",
  ".arw",
  ".dng",
  "image/x-adobe-dng",
  "image/x-sony-arw",
].join(",");

function normalizeMimeType(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === "application/octet-stream") {
    return null;
  }

  return normalized;
}

export function getPhotoFileExtension(filename: string) {
  const parts = filename.trim().toLowerCase().split(".");
  return parts.length > 1 ? parts.at(-1) ?? "" : "";
}

export function inferPhotoMimeType(
  filename: string,
  reportedMimeType?: string | null,
) {
  const normalizedMimeType = normalizeMimeType(reportedMimeType);

  if (normalizedMimeType) {
    return normalizedMimeType;
  }

  return MIME_BY_EXTENSION[getPhotoFileExtension(filename)] ?? "application/octet-stream";
}

export function isRawPhotoFile(
  filename: string,
  reportedMimeType?: string | null,
) {
  const normalizedMimeType = normalizeMimeType(reportedMimeType);

  return (
    RAW_EXTENSIONS.has(getPhotoFileExtension(filename)) ||
    (normalizedMimeType ? RAW_MIME_TYPES.has(normalizedMimeType) : false)
  );
}
