import { createHmac, timingSafeEqual } from "node:crypto";

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { enqueueWebhookStorageImports } from "@/lib/imports";
import {
  listStorageWebhookAdapters,
  parseStorageWebhookPayload,
} from "@/lib/storage-webhook-adapters";

function logWebhook(
  level: "info" | "warn" | "error",
  event: string,
  data: Record<string, unknown>,
) {
  const message = JSON.stringify({
    scope: "storage-webhook",
    event,
    at: new Date().toISOString(),
    ...data,
  });

  if (level === "error") {
    console.error(message);
    return;
  }

  if (level === "warn") {
    console.warn(message);
    return;
  }

  console.info(message);
}

function normalizeSignature(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith("sha256=") ? trimmed.slice(7) : trimmed;
}

function verifySignature(rawBody: string, signatureHeader: string | null) {
  if (!env.STORAGE_WEBHOOK_SECRET) {
    return true;
  }

  if (!signatureHeader) {
    return false;
  }

  const expected = createHmac("sha256", env.STORAGE_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  const received = normalizeSignature(signatureHeader);

  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");

  if (
    expectedBuffer.length === 0 ||
    receivedBuffer.length === 0 ||
    expectedBuffer.length !== receivedBuffer.length
  ) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get(env.STORAGE_WEBHOOK_SIGNATURE_HEADER);
  const deliveryIdHeader = request.headers.get("x-storage-delivery-id");
  const adapterHint =
    request.headers.get("x-storage-webhook-adapter") ??
    new URL(request.url).searchParams.get("adapter");

  if (!verifySignature(rawBody, signatureHeader)) {
    logWebhook("warn", "storage-webhook.invalid-signature", {
      header: env.STORAGE_WEBHOOK_SIGNATURE_HEADER,
    });

    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  let payload: unknown;

  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  let parsedPayload;

  try {
    parsedPayload = parseStorageWebhookPayload({
      payload,
      deliveryIdHeader,
      adapterHint,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Invalid storage webhook adapter.",
        adapters: listStorageWebhookAdapters(),
      },
      { status: 400 },
    );
  }

  logWebhook("info", "storage-webhook.received", {
    adapterId: parsedPayload.adapterId,
    recordCount: parsedPayload.records.length,
    deliveryId: deliveryIdHeader,
    adapterHint,
    signed: Boolean(env.STORAGE_WEBHOOK_SECRET),
  });

  if (!parsedPayload.records.length) {
    return NextResponse.json({
      message: "No importable object-create records were found in the webhook payload.",
      adapterId: parsedPayload.adapterId,
      summary: {
        jobsCreated: 0,
        itemsCreated: 0,
      },
    });
  }

  try {
    const summary = await enqueueWebhookStorageImports({
      records: parsedPayload.records,
      adapterId: parsedPayload.adapterId,
    });

    revalidatePath("/admin");
    revalidatePath("/admin/imports");
    revalidatePath("/admin/events");

    return NextResponse.json(
      {
        message:
          summary.itemsQueued > 0
            ? `Queued ${summary.itemsQueued} import items from webhook delivery.`
            : "Webhook delivery was recorded without new queued import work.",
        adapterId: parsedPayload.adapterId,
        summary,
      },
      { status: 202 },
    );
  } catch (error) {
    logWebhook("error", "storage-webhook.failed", {
      error: error instanceof Error ? error.message : "Unknown webhook failure.",
    });

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to process storage webhook.",
      },
      { status: 500 },
    );
  }
}
