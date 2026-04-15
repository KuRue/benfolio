import "server-only";

export type StorageWebhookAdapterId = "generic-s3" | "cloudflare-r2";

export type StorageWebhookRecord = {
  adapterId: StorageWebhookAdapterId;
  sourceProvider: string;
  sourceKey: string;
  bucket: string | null;
  eventName: string | null;
  size: number;
  lastModified: Date | null;
  deliveryId: string | null;
  sourceEtag: string | null;
  sourceVersion: string | null;
};

type StorageWebhookAdapterContext = {
  deliveryIdHeader: string | null;
};

type StorageWebhookAdapter = {
  id: StorageWebhookAdapterId;
  label: string;
  description: string;
  matches: (payload: unknown) => boolean;
  parse: (
    payload: unknown,
    context: StorageWebhookAdapterContext,
  ) => StorageWebhookRecord[];
};

function parseDate(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function decodeObjectKey(value: string) {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

function isObjectCreateEvent(eventName: string | null) {
  if (!eventName) {
    return true;
  }

  return /ObjectCreated|PutObject|CompleteMultipartUpload|CopyObject|create/i.test(
    eventName,
  );
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : null;
}

const genericS3Adapter: StorageWebhookAdapter = {
  id: "generic-s3",
  label: "Generic S3",
  description: "Accepts standard S3-style object-create webhook payloads.",
  matches(payload) {
    const body = asRecord(payload);

    if (!body) {
      return false;
    }

    return (
      Array.isArray(body.Records) ||
      Array.isArray(body.records) ||
      typeof body.key === "string" ||
      typeof body.sourceKey === "string"
    );
  },
  parse(payload, context) {
    const records: StorageWebhookRecord[] = [];
    const body = asRecord(payload);

    if (!body) {
      return records;
    }

    const appendRecord = (record: StorageWebhookRecord | null) => {
      if (!record || !isObjectCreateEvent(record.eventName)) {
        return;
      }

      records.push(record);
    };

    const rawRecords = asArray(body.Records) ?? asArray(body.records);

    if (rawRecords) {
      for (const entry of rawRecords) {
        const record = asRecord(entry);

        if (!record) {
          continue;
        }

        const s3 = asRecord(record.s3);
        const s3Bucket = asRecord(s3?.bucket);
        const s3Object = asRecord(s3?.object);
        const responseElements = asRecord(record.responseElements);
        const sourceKey =
          typeof record.key === "string"
            ? record.key
            : typeof record.sourceKey === "string"
              ? record.sourceKey
              : typeof s3Object?.key === "string"
                ? s3Object.key
                : null;

        appendRecord(
          sourceKey
            ? {
                adapterId: "generic-s3",
                sourceProvider: "generic-s3",
                sourceKey: decodeObjectKey(sourceKey),
                bucket:
                  typeof record.bucket === "string"
                    ? record.bucket
                    : typeof s3Bucket?.name === "string"
                      ? s3Bucket.name
                      : null,
                eventName:
                  typeof record.eventName === "string" ? record.eventName : null,
                size:
                  typeof record.size === "number"
                    ? record.size
                    : typeof s3Object?.size === "number"
                      ? s3Object.size
                      : 0,
                lastModified:
                  parseDate(
                    typeof record.lastModified === "string"
                      ? record.lastModified
                      : typeof record.eventTime === "string"
                        ? record.eventTime
                        : null,
                  ) ?? null,
                deliveryId:
                  typeof record.deliveryId === "string"
                    ? record.deliveryId
                    : typeof record.sequencer === "string"
                      ? record.sequencer
                      : typeof responseElements?.["x-amz-request-id"] === "string"
                        ? (responseElements["x-amz-request-id"] as string)
                        : context.deliveryIdHeader,
                sourceEtag:
                  typeof record.etag === "string"
                    ? record.etag
                    : typeof s3Object?.eTag === "string"
                      ? (s3Object.eTag as string)
                      : typeof s3Object?.etag === "string"
                        ? (s3Object.etag as string)
                        : null,
                sourceVersion:
                  typeof record.versionId === "string"
                    ? record.versionId
                    : typeof s3Object?.versionId === "string"
                      ? (s3Object.versionId as string)
                      : null,
              }
            : null,
        );
      }

      return records;
    }

    const sourceKey =
      typeof body.key === "string"
        ? body.key
        : typeof body.sourceKey === "string"
          ? body.sourceKey
          : null;

    if (!sourceKey) {
      return records;
    }

    appendRecord({
      adapterId: "generic-s3",
      sourceProvider: "generic-s3",
      sourceKey: decodeObjectKey(sourceKey),
      bucket: typeof body.bucket === "string" ? body.bucket : null,
      eventName: typeof body.eventName === "string" ? body.eventName : null,
      size: typeof body.size === "number" ? body.size : 0,
      lastModified: parseDate(body.lastModified) ?? null,
      deliveryId:
        typeof body.deliveryId === "string" ? body.deliveryId : context.deliveryIdHeader,
      sourceEtag: typeof body.etag === "string" ? body.etag : null,
      sourceVersion:
        typeof body.versionId === "string" ? body.versionId : null,
    });

    return records;
  },
};

const cloudflareR2Adapter: StorageWebhookAdapter = {
  id: "cloudflare-r2",
  label: "Cloudflare R2",
  description:
    "Accepts R2-oriented event payloads relayed to the app from a queue consumer or webhook bridge.",
  matches(payload) {
    const body = asRecord(payload);

    if (!body) {
      return false;
    }

    return (
      (typeof body.provider === "string" && /cloudflare|r2/i.test(body.provider)) ||
      Array.isArray(body.notifications) ||
      Array.isArray(body.messages) ||
      (Array.isArray(body.events) &&
        asRecord((body.events as unknown[])[0])?.object !== undefined) ||
      (asRecord(body.object) !== null &&
        (typeof body.bucketName === "string" ||
          typeof body.bucket === "string" ||
          typeof body.accountId === "string"))
    );
  },
  parse(payload, context) {
    const body = asRecord(payload);
    const records: StorageWebhookRecord[] = [];

    if (!body) {
      return records;
    }

    const appendEntry = (entryValue: unknown) => {
      const entry = asRecord(entryValue);

      if (!entry) {
        return;
      }

      const object = asRecord(entry.object);
      const bucket = asRecord(entry.bucket);
      const sourceKey =
        typeof entry.key === "string"
          ? entry.key
          : typeof entry.objectKey === "string"
            ? entry.objectKey
            : typeof object?.key === "string"
              ? (object.key as string)
              : null;

      if (!sourceKey) {
        return;
      }

      const eventName =
        typeof entry.eventType === "string"
          ? entry.eventType
          : typeof entry.action === "string"
            ? entry.action
            : typeof entry.eventName === "string"
              ? entry.eventName
              : null;

      if (!isObjectCreateEvent(eventName)) {
        return;
      }

      records.push({
        adapterId: "cloudflare-r2",
        sourceProvider: "cloudflare-r2",
        sourceKey: decodeObjectKey(sourceKey),
        bucket:
          typeof entry.bucketName === "string"
            ? entry.bucketName
            : typeof entry.bucket === "string"
              ? entry.bucket
              : typeof bucket?.name === "string"
                ? (bucket.name as string)
                : null,
        eventName,
        size:
          typeof entry.size === "number"
            ? entry.size
            : typeof object?.size === "number"
              ? (object.size as number)
              : typeof object?.length === "number"
                ? (object.length as number)
                : 0,
        lastModified:
          parseDate(
            typeof entry.eventTimestamp === "string"
              ? entry.eventTimestamp
              : typeof entry.eventTime === "string"
                ? entry.eventTime
                : typeof entry.timestamp === "string"
                  ? entry.timestamp
                  : null,
          ) ?? null,
        deliveryId:
          typeof entry.deliveryId === "string"
            ? entry.deliveryId
            : typeof entry.requestId === "string"
              ? entry.requestId
              : typeof entry.messageId === "string"
                ? entry.messageId
                : typeof entry.id === "string"
                  ? entry.id
                  : context.deliveryIdHeader,
        sourceEtag:
          typeof entry.etag === "string"
            ? entry.etag
            : typeof object?.etag === "string"
              ? (object.etag as string)
              : null,
        sourceVersion:
          typeof entry.version === "string"
            ? entry.version
            : typeof entry.versionId === "string"
              ? entry.versionId
              : typeof object?.version === "string"
                ? (object.version as string)
                : typeof object?.versionId === "string"
                  ? (object.versionId as string)
                  : null,
      });
    };

    const entries =
      asArray(body.notifications) ??
      asArray(body.messages) ??
      asArray(body.events);

    if (entries) {
      for (const entry of entries) {
        appendEntry(entry);
      }

      return records;
    }

    appendEntry(body);
    return records;
  },
};

const storageWebhookAdapters = [
  cloudflareR2Adapter,
  genericS3Adapter,
] as const satisfies readonly StorageWebhookAdapter[];

const adapterAliasMap = new Map<string, StorageWebhookAdapterId>([
  ["generic-s3", "generic-s3"],
  ["s3", "generic-s3"],
  ["generic", "generic-s3"],
  ["cloudflare-r2", "cloudflare-r2"],
  ["r2", "cloudflare-r2"],
  ["cloudflare", "cloudflare-r2"],
]);

export function listStorageWebhookAdapters() {
  return storageWebhookAdapters.map((adapter) => ({
    id: adapter.id,
    label: adapter.label,
    description: adapter.description,
  }));
}

function resolveWebhookAdapterHint(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return adapterAliasMap.get(value.trim().toLowerCase()) ?? null;
}

export function parseStorageWebhookPayload(args: {
  payload: unknown;
  deliveryIdHeader: string | null;
  adapterHint?: string | null;
}) {
  const hintedAdapterId = resolveWebhookAdapterHint(args.adapterHint);
  const hintedAdapter = hintedAdapterId
    ? storageWebhookAdapters.find((adapter) => adapter.id === hintedAdapterId) ?? null
    : null;

  if (args.adapterHint && !hintedAdapter) {
    throw new Error(`Unknown storage webhook adapter "${args.adapterHint}".`);
  }

  const adapter =
    hintedAdapter ??
    storageWebhookAdapters.find((candidate) => candidate.matches(args.payload)) ??
    genericS3Adapter;

  return {
    adapterId: adapter.id,
    records: adapter.parse(args.payload, {
      deliveryIdHeader: args.deliveryIdHeader,
    }),
  };
}
