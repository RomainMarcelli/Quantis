// Chiffrement AES-256-GCM des tokens d'intégration tiers (Pennylane, Chift, Bridge).
// Format de sortie : "<iv_b64>.<authTag_b64>.<ciphertext_b64>" — auto-suffisant pour rotation future.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

let cachedKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  if (cachedKey) {
    return cachedKey;
  }
  const raw = process.env.CONNECTOR_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "CONNECTOR_ENCRYPTION_KEY is not configured. Generate one with: openssl rand -base64 32"
    );
  }
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length !== KEY_LENGTH) {
    throw new Error(
      `CONNECTOR_ENCRYPTION_KEY must decode to ${KEY_LENGTH} bytes (AES-256). Got ${decoded.length}.`
    );
  }
  cachedKey = decoded;
  return decoded;
}

export function encryptToken(plaintext: string): string {
  if (!plaintext) {
    throw new Error("encryptToken: plaintext is empty");
  }
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${authTag.toString("base64")}.${ciphertext.toString("base64")}`;
}

export function decryptToken(payload: string): string {
  if (!payload) {
    throw new Error("decryptToken: payload is empty");
  }
  const parts = payload.split(".");
  if (parts.length !== 3) {
    throw new Error("decryptToken: invalid payload format (expected 3 base64 parts separated by '.')");
  }
  const iv = Buffer.from(parts[0]!, "base64");
  const authTag = Buffer.from(parts[1]!, "base64");
  const ciphertext = Buffer.from(parts[2]!, "base64");
  const key = getEncryptionKey();
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

// Pour les tests : reset du cache après mutation de l'env.
export function __resetTokenCryptoCacheForTests(): void {
  cachedKey = null;
}
