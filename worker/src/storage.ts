import { Buffer } from "node:buffer";

import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { env } from "./env.js";

const s3 = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
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

export async function readObject(bucket: string, key: string) {
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
