export type RuntimeEventVisibility = "DRAFT" | "HIDDEN" | "PUBLIC";
export type RuntimeImportsCleanupMode = "delete" | "archive";

export type RuntimeSettingsRecord = {
  storageProviderLabel?: string | null;
  storageEndpoint?: string | null;
  storagePublicEndpoint?: string | null;
  storageRegion?: string | null;
  storageForcePathStyle?: boolean | null;
  storageOriginalsBucket?: string | null;
  storageDerivativesBucket?: string | null;
  importsPrefix?: string | null;
  importsCleanupMode?: string | null;
  importsArchivePrefix?: string | null;
  publicSearchEnabled?: boolean | null;
  downloadsEnabled?: boolean | null;
  allowPublicIndexing?: boolean | null;
  defaultEventVisibility?: RuntimeEventVisibility | null;
  directUploadEnabled?: boolean | null;
  logoMarkEnabled?: boolean | null;
};

export type RuntimeSettingsEnv = {
  appUrl?: string;
  storageEndpoint: string;
  storagePublicEndpoint?: string | null;
  storageRegion?: string | null;
  storageForcePathStyle?: boolean | null;
  storageOriginalsBucket: string;
  storageDerivativesBucket: string;
  importsPrefix?: string | null;
  importsCleanupMode?: RuntimeImportsCleanupMode | null;
  importsArchivePrefix?: string | null;
};

export type ResolvedRuntimeSettings = {
  appUrl: string;
  storageProviderLabel: string | null;
  storageEndpoint: string;
  storagePublicEndpoint: string;
  storageRegion: string;
  storageForcePathStyle: boolean;
  storageOriginalsBucket: string;
  storageDerivativesBucket: string;
  importsPrefix: string;
  importsCleanupMode: RuntimeImportsCleanupMode;
  importsArchivePrefix: string;
  publicSearchEnabled: boolean;
  downloadsEnabled: boolean;
  allowPublicIndexing: boolean;
  defaultEventVisibility: RuntimeEventVisibility;
  directUploadEnabled: boolean;
  logoMarkEnabled: boolean;
};

export const DEFAULT_RUNTIME_SETTINGS: Omit<
  ResolvedRuntimeSettings,
  | "appUrl"
  | "storageEndpoint"
  | "storagePublicEndpoint"
  | "storageRegion"
  | "storageOriginalsBucket"
  | "storageDerivativesBucket"
> = {
  storageProviderLabel: null,
  storageForcePathStyle: true,
  importsPrefix: "imports/",
  importsCleanupMode: "delete",
  importsArchivePrefix: "processed-imports/",
  publicSearchEnabled: true,
  downloadsEnabled: true,
  allowPublicIndexing: true,
  defaultEventVisibility: "DRAFT",
  directUploadEnabled: true,
  logoMarkEnabled: true,
};

function cleanOptionalString(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizePrefix(value: string | null | undefined, fallback: string) {
  const normalized = cleanOptionalString(value) ?? fallback;
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

function normalizeCleanupMode(
  value: string | null | undefined,
): RuntimeImportsCleanupMode | null {
  return value === "archive" || value === "delete" ? value : null;
}

function normalizeVisibility(
  value: string | null | undefined,
): RuntimeEventVisibility | null {
  return value === "PUBLIC" || value === "HIDDEN" || value === "DRAFT"
    ? value
    : null;
}

export function resolveRuntimeSettings(args: {
  env: RuntimeSettingsEnv;
  record?: RuntimeSettingsRecord | null;
}): ResolvedRuntimeSettings {
  const record = args.record ?? null;
  const storageEndpoint =
    cleanOptionalString(record?.storageEndpoint) ?? args.env.storageEndpoint;
  const storagePublicEndpoint =
    cleanOptionalString(record?.storagePublicEndpoint) ??
    cleanOptionalString(args.env.storagePublicEndpoint) ??
    storageEndpoint;
  const storageRegion =
    cleanOptionalString(record?.storageRegion) ??
    cleanOptionalString(args.env.storageRegion) ??
    "auto";
  const importsCleanupMode =
    normalizeCleanupMode(record?.importsCleanupMode) ??
    normalizeCleanupMode(args.env.importsCleanupMode) ??
    DEFAULT_RUNTIME_SETTINGS.importsCleanupMode;
  const importsArchivePrefix = normalizePrefix(
    record?.importsArchivePrefix ?? args.env.importsArchivePrefix,
    DEFAULT_RUNTIME_SETTINGS.importsArchivePrefix,
  );

  return {
    appUrl: args.env.appUrl ?? "http://localhost:3000",
    storageProviderLabel: cleanOptionalString(record?.storageProviderLabel),
    storageEndpoint,
    storagePublicEndpoint,
    storageRegion,
    storageForcePathStyle:
      record?.storageForcePathStyle ??
      args.env.storageForcePathStyle ??
      DEFAULT_RUNTIME_SETTINGS.storageForcePathStyle,
    storageOriginalsBucket:
      cleanOptionalString(record?.storageOriginalsBucket) ??
      args.env.storageOriginalsBucket,
    storageDerivativesBucket:
      cleanOptionalString(record?.storageDerivativesBucket) ??
      args.env.storageDerivativesBucket,
    importsPrefix: normalizePrefix(
      record?.importsPrefix ?? args.env.importsPrefix,
      DEFAULT_RUNTIME_SETTINGS.importsPrefix,
    ),
    importsCleanupMode,
    importsArchivePrefix,
    publicSearchEnabled:
      record?.publicSearchEnabled ?? DEFAULT_RUNTIME_SETTINGS.publicSearchEnabled,
    downloadsEnabled:
      record?.downloadsEnabled ?? DEFAULT_RUNTIME_SETTINGS.downloadsEnabled,
    allowPublicIndexing:
      record?.allowPublicIndexing ?? DEFAULT_RUNTIME_SETTINGS.allowPublicIndexing,
    defaultEventVisibility:
      normalizeVisibility(record?.defaultEventVisibility) ??
      DEFAULT_RUNTIME_SETTINGS.defaultEventVisibility,
    directUploadEnabled:
      record?.directUploadEnabled ?? DEFAULT_RUNTIME_SETTINGS.directUploadEnabled,
    logoMarkEnabled:
      record?.logoMarkEnabled ?? DEFAULT_RUNTIME_SETTINGS.logoMarkEnabled,
  };
}
