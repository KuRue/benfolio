import { randomBytes } from "node:crypto";

const BASE62_ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const BASE62_LENGTH = BASE62_ALPHABET.length;

export function generatePhotoId(length = 12) {
  if (length < 10 || length > 12) {
    throw new Error("Photo IDs must be between 10 and 12 characters.");
  }

  let output = "";

  while (output.length < length) {
    const buffer = randomBytes(length);

    for (const byte of buffer) {
      if (byte >= BASE62_LENGTH * 4) {
        continue;
      }

      output += BASE62_ALPHABET[byte % BASE62_LENGTH];

      if (output.length === length) {
        break;
      }
    }
  }

  return output;
}
