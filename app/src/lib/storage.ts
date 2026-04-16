import "server-only";

import { Buffer } from "node:buffer";

import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "@/lib/env";

const s3 = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
});

const uploadS3 = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
});

export const storageBuckets = {
  originals: env.S3_BUCKET_ORIGINALS,
  derivatives: env.S3_BUCKET_DERIVATIVES,
} as const;

export async function uploadObject(args: {
  bucket: string;
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
  cacheControl?: string;
}) {
  await s3.send(
    new PutObjectCommand({
      Bucket: args.bucket,
      Key: args.key,
      Body: args.body,
      ContentType: args.contentType,
      CacheControl: args.cacheControl,
    }),
  );
}

type UploadMetadataValue = string | number | boolean | null | undefined;

function normalizeUploadMetadata(
  metadata: Record<string, UploadMetadataValue> | undefined,
) {
  if (!metadata) {
    return undefined;
  }

  const normalized = Object.fromEntries(
    Object.entries(metadata)
      .filter(([, value]) => value !== null && value !== undefined && value !== "")
      .map(([key, value]) => [key.toLowerCase(), String(value)]),
  );

  return Object.keys(normalized).length ? normalized : undefined;
}

export async function presignUploadObject(args: {
  bucket: string;
  key: string;
  contentType: string;
  cacheControl?: string;
  expiresInSeconds?: number;
  metadata?: Record<string, UploadMetadataValue>;
}) {
  const metadata = normalizeUploadMetadata(args.metadata);
  const command = new PutObjectCommand({
    Bucket: args.bucket,
    Key: args.key,
    ContentType: args.contentType,
    CacheControl: args.cacheControl,
    Metadata: metadata,
  });
  const url = await getSignedUrl(uploadS3, command, {
    expiresIn: args.expiresInSeconds ?? 60 * 15,
  });

  return {
    method: "PUT" as const,
    url,
    headers: {
      "Content-Type": args.contentType,
      ...(metadata
        ? Object.fromEntries(
            Object.entries(metadata).map(([key, value]) => [
              `x-amz-meta-${key}`,
              value,
            ]),
          )
        : {}),
    },
  };
}

export async function readObject(args: { bucket: string; key: string }) {
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: args.bucket,
      Key: args.key,
    }),
  );

  if (!response.Body) {
    throw new Error(`Missing object body for ${args.bucket}/${args.key}`);
  }

  const body = Buffer.from(await response.Body.transformToByteArray());

  return {
    body,
    contentType: response.ContentType ?? "application/octet-stream",
    cacheControl: response.CacheControl ?? undefined,
  };
}

export async function headObject(args: { bucket: string; key: string }) {
  const response = await s3.send(
    new HeadObjectCommand({
      Bucket: args.bucket,
      Key: args.key,
    }),
  );

  return {
    contentType: response.ContentType ?? "application/octet-stream",
    contentLength: response.ContentLength ?? null,
    lastModified: response.LastModified ?? null,
    eTag: response.ETag ?? null,
    metadata: response.Metadata ?? {},
  };
}

export async function listObjects(args: { bucket: string; prefix: string }) {
  const objects: Array<{
    key: string;
    size: number;
    lastModified: Date | null;
  }> = [];

  let continuationToken: string | undefined;

  do {
    const response = await s3.send(
      new ListObjectsV2Command({
        Bucket: args.bucket,
        Prefix: args.prefix,
        ContinuationToken: continuationToken,
      }),
    );

    for (const object of response.Contents ?? []) {
      if (!object.Key) {
        continue;
      }

      objects.push({
        key: object.Key,
        size: object.Size ?? 0,
        lastModified: object.LastModified ?? null,
      });
    }

    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return objects;
}

function encodeCopySource(bucket: string, key: string) {
  const encodedKey = key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${bucket}/${encodedKey}`;
}

export async function copyObject(args: {
  sourceBucket: string;
  sourceKey: string;
  destinationBucket: string;
  destinationKey: string;
}) {
  await s3.send(
    new CopyObjectCommand({
      Bucket: args.destinationBucket,
      Key: args.destinationKey,
      CopySource: encodeCopySource(args.sourceBucket, args.sourceKey),
      MetadataDirective: "COPY",
    }),
  );
}

export async function deleteObjects(args: { bucket: string; keys: string[] }) {
  const keys = args.keys.filter(Boolean);

  if (!keys.length) {
    return;
  }

  await s3.send(
    new DeleteObjectsCommand({
      Bucket: args.bucket,
      Delete: {
        Objects: keys.map((key) => ({ Key: key })),
        Quiet: true,
      },
    }),
  );
}

export function extensionFromFilename(filename: string) {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.at(-1)?.toLowerCase() ?? "jpg" : "jpg";
}

export function buildDisplayUrl(storageKey: string | null | undefined) {
  if (!storageKey) {
    return null;
  }

  return `/i/${storageKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}
