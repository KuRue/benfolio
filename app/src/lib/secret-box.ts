import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { env } from "@/lib/env";

const SECRET_BOX_PREFIX = "v1";

function getSecretBoxKey() {
  return createHash("sha256").update(env.AUTH_COOKIE_SECRET).digest();
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getSecretBoxKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    SECRET_BOX_PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptSecret(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  if (!value.startsWith(`${SECRET_BOX_PREFIX}:`)) {
    return value;
  }

  const [, ivValue, tagValue, encryptedValue] = value.split(":");

  if (!ivValue || !tagValue || !encryptedValue) {
    return null;
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      getSecretBoxKey(),
      Buffer.from(ivValue, "base64url"),
    );

    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));

    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
