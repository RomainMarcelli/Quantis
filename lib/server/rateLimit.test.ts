// lib/server/rateLimit.test.ts
// Vérifie le comportement du rate limiting fixed window (seuil, blocage, réinitialisation).
import { beforeEach, describe, expect, it } from "vitest";
import { checkFixedWindowRateLimit, resetRateLimitStoreForTests } from "@/lib/server/rateLimit";

describe("checkFixedWindowRateLimit", () => {
  beforeEach(() => {
    // Chaque test repart d'un store vide pour rester isolé et déterministe.
    resetRateLimitStoreForTests();
  });

  it("autorise les requêtes tant que la limite de fenêtre n'est pas atteinte", () => {
    const firstResult = checkFixedWindowRateLimit({
      key: "route:127.0.0.1",
      maxRequests: 2,
      windowMs: 60_000,
      nowMs: 1_000
    });

    const secondResult = checkFixedWindowRateLimit({
      key: "route:127.0.0.1",
      maxRequests: 2,
      windowMs: 60_000,
      nowMs: 2_000
    });

    expect(firstResult.allowed).toBe(true);
    expect(secondResult.allowed).toBe(true);
    expect(secondResult.remaining).toBe(0);
  });

  it("bloque la requête au-delà du plafond de la fenêtre courante", () => {
    checkFixedWindowRateLimit({
      key: "route:127.0.0.1",
      maxRequests: 2,
      windowMs: 60_000,
      nowMs: 1_000
    });
    checkFixedWindowRateLimit({
      key: "route:127.0.0.1",
      maxRequests: 2,
      windowMs: 60_000,
      nowMs: 2_000
    });

    const blockedResult = checkFixedWindowRateLimit({
      key: "route:127.0.0.1",
      maxRequests: 2,
      windowMs: 60_000,
      nowMs: 3_000
    });

    expect(blockedResult.allowed).toBe(false);
    expect(blockedResult.remaining).toBe(0);
    expect(blockedResult.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("réinitialise le compteur après expiration de la fenêtre", () => {
    const firstResult = checkFixedWindowRateLimit({
      key: "route:127.0.0.1",
      maxRequests: 1,
      windowMs: 10_000,
      nowMs: 1_000
    });

    const blockedResult = checkFixedWindowRateLimit({
      key: "route:127.0.0.1",
      maxRequests: 1,
      windowMs: 10_000,
      nowMs: 2_000
    });

    const reopenedResult = checkFixedWindowRateLimit({
      key: "route:127.0.0.1",
      maxRequests: 1,
      windowMs: 10_000,
      nowMs: firstResult.resetAt + 1
    });

    expect(blockedResult.allowed).toBe(false);
    expect(reopenedResult.allowed).toBe(true);
    expect(reopenedResult.remaining).toBe(0);
  });
});
