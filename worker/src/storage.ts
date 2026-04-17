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

import { env } from "./env.js";
import { getResolvedRuntimeSettings } from "./runtime-settings.js";

let cachedStorageClient: {
  key: string;
  client: S3Client;
} | null = null;

async function getStorageRuntime() {
  const settings = await getResolvedRuntimeSettings();
  const key = JSON.stringify({
    endpoint: settings.storageEndpoint,
    region: settings.storageRegion,
    forcePathStyle: settings.storageForcePathStyle,
  });

  if (cachedStorageClient?.key !== key) {
    cachedStorageClient = {
      key,
      client: new S3Client({
        region: settings.storageRegion,
        endpoint: settings.storageEndpoint,
        forcePathStyle: settings.storageForcePathStyle,
        credentials: {
          accessKeyId: env.S3_ACCESS_KEY_ID,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        },
      }),
    };
  }

  return {
    s3: cachedStorageClient.client,
    buckets: {
      originals: settings.storageOriginalsBucket,
      derivatives: settings.storageDerivativesBucket,
    },
    settings,
  };
}

export async function getStorageBuckets() {
  const { buckets } = await getStorageRuntime();
  return buckets;
}

export async function readObject(bucket: string, key: string) {
  const { s3 } = await getStorageRuntime();
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );

  if (!response.Body) {
    throw new Error(`Missing object body for ${bucket}/${key}`);
  }

  return Buffer.from(await response.Body.transformToByteArray());
}

export async function headObject(bucket: string, key: string) {
  const { s3 } = await getStorageRuntime();
  const response = await s3.send(
    new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );

  return {
    contentType: response.ContentType ?? "application/octet-stream",
    contentLength: response.ContentLength ?? null,
    lastModified: response.LastModified ?? null,
  };
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
  const { s3 } = await getStorageRuntime();
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
  const { s3 } = await getStorageRuntime();
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

export async function listObjects(args: { bucket: string; prefix: string }) {
  const { s3 } = await getStorageRuntime();
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

export async function uploadObject(args: {
  bucket: string;
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
  cacheControl?: string;
}) {
  const { s3 } = await getStorageRuntime();
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
