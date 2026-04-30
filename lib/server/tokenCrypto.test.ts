import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __resetTokenCryptoCacheForTests, decryptToken, encryptToken } from "@/lib/server/tokenCrypto";

const VALID_KEY = "gOZvDQK/CqcnSGjXa9k/U6uNsDJvs6lf1gGEFWPOGIw=";

describe("tokenCrypto", () => {
  let originalKey: string | undefined;

  beforeEach(() => {
    originalKey = process.env.CONNECTOR_ENCRYPTION_KEY;
    process.env.CONNECTOR_ENCRYPTION_KEY = VALID_KEY;
    __resetTokenCryptoCacheForTests();
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.CONNECTOR_ENCRYPTION_KEY;
    } else {
      process.env.CONNECTOR_ENCRYPTION_KEY = originalKey;
    }
    __resetTokenCryptoCacheForTests();
  });

  it("round-trips a token", () => {
    const plaintext = "pennylane_company_token_abc123";
    const cipher = encryptToken(plaintext);
    expect(cipher).not.toBe(plaintext);
    expect(cipher.split(".")).toHaveLength(3);
    expect(decryptToken(cipher)).toBe(plaintext);
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const a = encryptToken("same-secret");
    const b = encryptToken("same-secret");
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe("same-secret");
    expect(decryptToken(b)).toBe("same-secret");
  });

  it("rejects a tampered ciphertext (auth tag mismatch)", () => {
    const cipher = encryptToken("secret");
    const [iv, tag, ct] = cipher.split(".");
    // Flip a byte in the ciphertext.
    const tampered = Buffer.from(ct!, "base64");
    tampered[0] = tampered[0]! ^ 0xff;
    const broken = `${iv}.${tag}.${tampered.toString("base64")}`;
    expect(() => decryptToken(broken)).toThrow();
  });

  it("rejects malformed payloads", () => {
    expect(() => decryptToken("not-a-valid-payload")).toThrow();
    expect(() => decryptToken("only.two")).toThrow();
  });

  it("throws when the key is missing", () => {
    delete process.env.CONNECTOR_ENCRYPTION_KEY;
    __resetTokenCryptoCacheForTests();
    expect(() => encryptToken("x")).toThrow(/CONNECTOR_ENCRYPTION_KEY is not configured/);
  });

  it("throws when the key is the wrong length", () => {
    process.env.CONNECTOR_ENCRYPTION_KEY = Buffer.from("too-short").toString("base64");
    __resetTokenCryptoCacheForTests();
    expect(() => encryptToken("x")).toThrow(/must decode to 32 bytes/);
  });
});
