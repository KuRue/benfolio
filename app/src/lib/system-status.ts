import "server-only";

import { env } from "@/lib/env";
import { getAppSettingsRecord, resolveAppRuntimeSettings } from "@/lib/app-settings";
import { prisma } from "@/lib/prisma";
import { getQueueBacklogCounts, getRedisPing } from "@/lib/queue";
import { runStorageDiagnostics } from "@/lib/storage";

const WORKER_STALE_AFTER_MS = 2 * 60 * 1000;
const DEFAULT_SITE_NAME = "Your Studio";

type HealthState = "ok" | "warn" | "error";
type SetupState = "not_started" | "needs_attention" | "ready";
type SetupStepState = "not_started" | "needs_attention" | "ready";

function toState(ok: boolean): HealthState {
  return ok ? "ok" : "error";
}

function getWorkerState(lastHeartbeatAt: Date | null) {
  if (!lastHeartbeatAt) {
    return {
      state: "error" as const,
      detail: "No heartbeat yet.",
      fresh: false,
    };
  }

  const ageMs = Date.now() - lastHeartbeatAt.getTime();

  if (ageMs > WORKER_STALE_AFTER_MS) {
    return {
      state: "warn" as const,
      detail: "Worker heartbeat is stale.",
      fresh: false,
    };
  }

  return {
    state: "ok" as const,
    detail: "Worker heartbeat is current.",
    fresh: true,
  };
}

export async function getSystemDiagnostics() {
  let databaseOk = true;
  let databaseError: string | null = null;
  let appSettingsRecord = null;
  let siteProfile: {
    displayName: string;
    websiteUrl: string | null;
    coverDisplayKey: string | null;
    avatarDisplayKey: string | null;
  } | null = null;
  let workerHeartbeat: {
    lastHeartbeatAt: Date;
    lastPhotoProcessedAt: Date | null;
    lastImportProcessedAt: Date | null;
  } | null = null;
  let photoFailureCount = 0;
  let importFailureCount = 0;
  let readyPhotoCount = 0;
  let photoProcessedAt: { _max: { processedAt: Date | null } } = {
    _max: { processedAt: null },
  };
  let importCompletedAt: { _max: { completedAt: Date | null } } = {
    _max: { completedAt: null },
  };
  let manualUploadCount = 0;

  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    appSettingsRecord = await getAppSettingsRecord();
    [
      siteProfile,
      workerHeartbeat,
      photoFailureCount,
      importFailureCount,
      readyPhotoCount,
      photoProcessedAt,
      importCompletedAt,
      manualUploadCount,
    ] = await Promise.all([
      prisma.siteProfile.findUnique({
        where: { id: "default" },
        select: {
          displayName: true,
          websiteUrl: true,
          coverDisplayKey: true,
          avatarDisplayKey: true,
        },
      }),
      prisma.workerHeartbeat.findUnique({
        where: { id: "worker" },
        select: {
          lastHeartbeatAt: true,
          lastPhotoProcessedAt: true,
          lastImportProcessedAt: true,
        },
      }),
      prisma.photo.count({
        where: {
          processingState: "FAILED",
        },
      }),
      prisma.importItem.count({
        where: {
          source: "STORAGE_IMPORT",
          status: "FAILED",
        },
      }),
      prisma.photo.count({
        where: {
          processingState: "READY",
        },
      }),
      prisma.photo.aggregate({
        _max: {
          processedAt: true,
        },
      }),
      prisma.importItem.aggregate({
        where: {
          source: "STORAGE_IMPORT",
          status: "COMPLETE",
        },
        _max: {
          completedAt: true,
        },
      }),
      prisma.importJob.count({
        where: {
          type: "MANUAL_UPLOAD",
          status: "SUCCEEDED",
        },
      }),
    ]);
  } catch (error) {
    databaseOk = false;
    databaseError =
      error instanceof Error ? error.message : "Database connection failed.";
  }
  const runtimeSettings = resolveAppRuntimeSettings(appSettingsRecord);

  let redisOk = true;
  let redisError: string | null = null;
  let queueCounts = {
    photos: {} as Record<string, number>,
    imports: {} as Record<string, number>,
  };

  try {
    await getRedisPing();
    queueCounts = await getQueueBacklogCounts();
  } catch (error) {
    redisOk = false;
    redisError =
      error instanceof Error ? error.message : "Redis connection failed.";
  }

  const storage = await runStorageDiagnostics(runtimeSettings).catch((error) => ({
    storageEndpoint: runtimeSettings.storageEndpoint,
    storagePublicEndpoint: runtimeSettings.storagePublicEndpoint,
    originalsBucket: runtimeSettings.storageOriginalsBucket,
    derivativesBucket: runtimeSettings.storageDerivativesBucket,
    originalsReachable: false,
    derivativesReachable: false,
    errors: [
      error instanceof Error ? error.message : "Storage diagnostics failed.",
    ],
  }));

  const worker = getWorkerState(workerHeartbeat?.lastHeartbeatAt ?? null);
  const storageReachable = storage.originalsReachable && storage.derivativesReachable;
  const brandReady = Boolean(
    siteProfile &&
      (siteProfile.displayName.trim() !== DEFAULT_SITE_NAME ||
        siteProfile.coverDisplayKey ||
        siteProfile.avatarDisplayKey ||
        siteProfile.websiteUrl),
  );
  const uploadReady = manualUploadCount > 0 || readyPhotoCount > 0;
  const processingReady =
    readyPhotoCount > 0 ||
    Boolean(workerHeartbeat?.lastPhotoProcessedAt ?? photoProcessedAt._max.processedAt);

  const setupSteps = [
    {
      key: "brand",
      label: "Brand",
      state: brandReady ? "ready" : "not_started",
      detail: brandReady ? "Public identity is set." : "Set the public identity.",
      href: "/admin/settings",
    },
    {
      key: "storage",
      label: "Storage",
      state: storageReachable ? "ready" : "needs_attention",
      detail: storageReachable
        ? "Originals and derivatives buckets are reachable."
        : "Storage or one of the buckets is unavailable.",
      href: "/admin/settings",
    },
    {
      key: "uploads",
      label: "Uploads",
      state: uploadReady ? "ready" : "not_started",
      detail: uploadReady ? "At least one upload was registered." : "Run a test upload.",
      href: "/admin/uploads",
    },
    {
      key: "worker",
      label: "Worker",
      state: processingReady && worker.fresh ? "ready" : "needs_attention",
      detail:
        processingReady && worker.fresh
          ? "Background processing is active."
          : "Worker heartbeat or processing still needs attention.",
      href: "/admin/settings",
    },
    {
      key: "imports",
      label: "Imports",
      state:
        runtimeSettings.importsPrefix !== "imports/" ||
        runtimeSettings.importsCleanupMode !== "delete"
          ? "ready"
          : "not_started",
      detail:
        runtimeSettings.importsPrefix !== "imports/" ||
        runtimeSettings.importsCleanupMode !== "delete"
          ? "Imports were customized."
          : "Defaults are still in place.",
      href: "/admin/imports",
    },
  ] satisfies Array<{
    key: string;
    label: string;
    state: SetupStepState;
    detail: string;
    href: string;
  }>;

  let setupState: SetupState = "ready";
  if (setupSteps.every((step) => step.state === "not_started")) {
    setupState = "not_started";
  } else if (setupSteps.some((step) => step.state !== "ready")) {
    setupState = "needs_attention";
  }

  const warnings = [
    !env.STORAGE_WEBHOOK_SECRET
      ? "Webhook signatures are disabled."
      : null,
    !appSettingsRecord
      ? "Operational settings are using env and code defaults."
      : null,
    runtimeSettings.directUploadEnabled &&
    runtimeSettings.storagePublicEndpoint === runtimeSettings.storageEndpoint
      ? "Direct uploads use the primary storage endpoint."
      : null,
  ].filter(Boolean) as string[];

  return {
    runtimeSettings,
    checks: [
      {
        key: "database",
        label: "Database",
        state: toState(databaseOk),
        detail: databaseOk ? "Connected." : databaseError,
      },
      {
        key: "redis",
        label: "Redis",
        state: toState(redisOk),
        detail: redisOk ? "Connected." : redisError,
      },
      {
        key: "storage",
        label: "Storage",
        state: storageReachable ? "ok" : "error",
        detail: storageReachable
          ? "Endpoint and buckets are reachable."
          : storage.errors.join(" ") || "Storage check failed.",
      },
      {
        key: "originals",
        label: "Originals bucket",
        state: toState(storage.originalsReachable),
        detail: storage.originalsReachable
          ? storage.originalsBucket
          : storage.errors[0] ?? "Originals bucket unavailable.",
      },
      {
        key: "derivatives",
        label: "Derivatives bucket",
        state: toState(storage.derivativesReachable),
        detail: storage.derivativesReachable
          ? storage.derivativesBucket
          : storage.errors.at(-1) ?? "Derivatives bucket unavailable.",
      },
      {
        key: "worker",
        label: "Worker",
        state: worker.state,
        detail: worker.detail,
      },
    ] satisfies Array<{
      key: string;
      label: string;
      state: HealthState;
      detail: string | null;
    }>,
    queueCounts,
    failures: {
      photos: photoFailureCount,
      imports: importFailureCount,
    },
    lastSuccess: {
      photoProcessedAt:
        workerHeartbeat?.lastPhotoProcessedAt ?? photoProcessedAt._max.processedAt ?? null,
      importCompletedAt:
        workerHeartbeat?.lastImportProcessedAt ??
        importCompletedAt._max.completedAt ??
        null,
    },
    setup: {
      state: setupState,
      steps: setupSteps,
    },
    workerHeartbeat,
    storage,
    warnings,
  };
}
