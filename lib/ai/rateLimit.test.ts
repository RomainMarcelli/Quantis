// File: lib/ai/rateLimit.test.ts
// Role: tests unitaires du rate limit IA quotidien (Firestore mocké).

import { beforeEach, describe, expect, it, vi } from "vitest";

const { setMock, getMock, docMock, dailyCollectionMock, userDocMock, usageCollectionMock, firestoreMock } = vi.hoisted(() => {
  const setMock = vi.fn();
  const getMock = vi.fn();
  const docMock = vi.fn();
  const dailyCollectionMock = { doc: docMock };
  const userDocMock = { collection: vi.fn() };
  const usageCollectionMock = { doc: vi.fn() };
  const firestoreMock = { collection: vi.fn() };
  return { setMock, getMock, docMock, dailyCollectionMock, userDocMock, usageCollectionMock, firestoreMock };
});

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    increment: (n: number) => ({ __op: "increment", value: n }),
    serverTimestamp: () => ({ __op: "serverTimestamp" }),
  },
}));

vi.mock("@/lib/server/firebaseAdmin", () => ({
  getFirebaseAdminFirestore: () => firestoreMock,
}));

import { consumeDailyQuota, readRemainingQuota, DAILY_AI_QUOTA, getNextResetISO, __TESTING__ } from "@/lib/ai/rateLimit";

describe("rateLimit IA quotidien", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestoreMock.collection.mockReturnValue(usageCollectionMock);
    usageCollectionMock.doc.mockReturnValue(userDocMock);
    userDocMock.collection.mockReturnValue(dailyCollectionMock);
    docMock.mockReturnValue({ set: setMock, get: getMock });
  });

  describe("todayKeyUTC", () => {
    it("formate la date en YYYY-MM-DD UTC", () => {
      // 2026-04-30 23:59:00 UTC
      const date = new Date(Date.UTC(2026, 3, 30, 23, 59, 0));
      expect(__TESTING__.todayKeyUTC(date)).toBe("2026-04-30");
    });

    it("ne dépend pas de la timezone locale (toujours UTC)", () => {
      const date = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
      expect(__TESTING__.todayKeyUTC(date)).toBe("2026-01-01");
    });
  });

  describe("consumeDailyQuota", () => {
    it("incrémente le compteur et autorise tant que used <= quota", async () => {
      setMock.mockResolvedValueOnce(undefined);
      getMock.mockResolvedValueOnce({ data: () => ({ count: 5 }) });

      const result = await consumeDailyQuota("user-1", {
        now: new Date(Date.UTC(2026, 3, 30)),
      });

      expect(firestoreMock.collection).toHaveBeenCalledWith("ai_usage");
      expect(usageCollectionMock.doc).toHaveBeenCalledWith("user-1");
      expect(userDocMock.collection).toHaveBeenCalledWith("daily");
      expect(docMock).toHaveBeenCalledWith("2026-04-30");
      expect(setMock).toHaveBeenCalledWith(
        {
          count: { __op: "increment", value: 1 },
          lastUsedAt: { __op: "serverTimestamp" },
        },
        { merge: true }
      );
      expect(result.allowed).toBe(true);
      expect(result.used).toBe(5);
      expect(result.remaining).toBe(DAILY_AI_QUOTA - 5);
    });

    it("rejette quand le quota est dépassé", async () => {
      setMock.mockResolvedValueOnce(undefined);
      getMock.mockResolvedValueOnce({ data: () => ({ count: 51 }) });

      const result = await consumeDailyQuota("user-1");
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.used).toBe(51);
    });

    it("autorise au pile à 50 (limite stricte > et non >=)", async () => {
      setMock.mockResolvedValueOnce(undefined);
      getMock.mockResolvedValueOnce({ data: () => ({ count: 50 }) });

      const result = await consumeDailyQuota("user-1");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0);
    });

    it("supporte un quota custom (utile pour les tests)", async () => {
      setMock.mockResolvedValueOnce(undefined);
      getMock.mockResolvedValueOnce({ data: () => ({ count: 4 }) });

      const result = await consumeDailyQuota("user-1", { quota: 3 });
      expect(result.allowed).toBe(false);
      expect(result.used).toBe(4);
    });
  });

  describe("readRemainingQuota", () => {
    it("retourne 50 quand aucun doc n'existe (pas encore d'usage aujourd'hui)", async () => {
      getMock.mockResolvedValueOnce({ exists: false, data: () => undefined });
      const r = await readRemainingQuota("user-1");
      expect(r.used).toBe(0);
      expect(r.remaining).toBe(50);
      expect(r.quota).toBe(50);
    });

    it("retourne le restant correct quand des appels ont déjà été consommés", async () => {
      getMock.mockResolvedValueOnce({ exists: true, data: () => ({ count: 7 }) });
      const r = await readRemainingQuota("user-1");
      expect(r.used).toBe(7);
      expect(r.remaining).toBe(43);
    });
  });

  describe("DAILY_AI_QUOTA constant", () => {
    it("vaut 50 — équilibre usage pro / coût maîtrisé", () => {
      expect(DAILY_AI_QUOTA).toBe(50);
    });
  });

  describe("getNextResetISO", () => {
    it("retourne une ISO datetime strictement > now", () => {
      const now = new Date();
      const iso = getNextResetISO(now);
      expect(typeof iso).toBe("string");
      // Format ISO valide
      const parsed = new Date(iso);
      expect(Number.isNaN(parsed.getTime())).toBe(false);
      // > now
      expect(parsed.getTime()).toBeGreaterThan(now.getTime());
      // <= 25h dans le futur (24h max + marge DST/timezone)
      expect(parsed.getTime() - now.getTime()).toBeLessThanOrEqual(25 * 60 * 60 * 1000);
    });
  });
});
