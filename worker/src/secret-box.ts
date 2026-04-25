import { createDecipheriv, createHash } from "node:crypto";

import { env } from "./env.js";

const SECRET_BOX_PREFIX = "v1";

function getSecretBoxKey() {
  return createHash("sha256").update(env.AUTH_COOKIE_SECRET).digest();
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
