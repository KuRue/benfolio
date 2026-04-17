CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "storageProviderLabel" TEXT,
    "storageEndpoint" TEXT,
    "storagePublicEndpoint" TEXT,
    "storageRegion" TEXT,
    "storageForcePathStyle" BOOLEAN,
    "storageOriginalsBucket" TEXT,
    "storageDerivativesBucket" TEXT,
    "importsPrefix" TEXT,
    "importsCleanupMode" TEXT,
    "importsArchivePrefix" TEXT,
    "publicSearchEnabled" BOOLEAN NOT NULL DEFAULT true,
    "downloadsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "allowPublicIndexing" BOOLEAN NOT NULL DEFAULT true,
    "defaultEventVisibility" "EventVisibility" NOT NULL DEFAULT 'DRAFT',
    "directUploadEnabled" BOOLEAN NOT NULL DEFAULT true,
    "logoMarkEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkerHeartbeat" (
    "id" TEXT NOT NULL DEFAULT 'worker',
    "lastHeartbeatAt" TIMESTAMP(3) NOT NULL,
    "lastPhotoProcessedAt" TIMESTAMP(3),
    "lastImportProcessedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("id")
);
