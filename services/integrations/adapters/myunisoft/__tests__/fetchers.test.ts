// Tests unitaires sur les helpers de fenêtre temporelle des fetchers MyUnisoft.
// Garantit que l'on respecte le plafond API "≤ 12 mois" sur /mad/entries et
// /mad/balance — bug observé en prod : un sync 36 mois retournait 400 et
// produisait une analyse vide (zéro KPI persisté en Firestore).

import { describe, expect, it } from "vitest";
import {
  MAD_MAX_WINDOW_MONTHS,
  clampDateRangeToMaxMonths,
  splitDateRangeIntoChunks,
} from "@/services/integrations/adapters/myunisoft/fetchers";

function diffMonths(a: Date, b: Date): number {
  return (
    (b.getFullYear() - a.getFullYear()) * 12 +
    (b.getMonth() - a.getMonth())
  );
}

describe("splitDateRangeIntoChunks", () => {
  it("retourne 1 seul chunk quand la fenêtre est ≤ 12 mois", () => {
    const start = new Date("2026-01-01");
    const end = new Date("2026-12-31");
    const chunks = splitDateRangeIntoChunks(start, end);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].start.toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(chunks[0].end.toISOString().slice(0, 10)).toBe("2026-12-31");
  });

  it("découpe une fenêtre 36 mois en 3 chunks de ≤ 12 mois (cas sync initial par défaut)", () => {
    const start = new Date("2023-05-07");
    const end = new Date("2026-05-07");
    const chunks = splitDateRangeIntoChunks(start, end);
    expect(chunks).toHaveLength(3);
    // Tous les chunks respectent la limite de 12 mois côté API
    for (const chunk of chunks) {
      expect(diffMonths(chunk.start, chunk.end)).toBeLessThanOrEqual(MAD_MAX_WINDOW_MONTHS);
    }
    // Chunks consécutifs sans chevauchement et sans trou (start[N+1] = end[N] + 1 jour)
    for (let i = 0; i + 1 < chunks.length; i++) {
      const expectedNextStart = new Date(chunks[i].end);
      expectedNextStart.setDate(expectedNextStart.getDate() + 1);
      expect(chunks[i + 1].start.toISOString().slice(0, 10)).toBe(
        expectedNextStart.toISOString().slice(0, 10)
      );
    }
    // Dernier chunk doit terminer exactement à `end`
    expect(chunks[chunks.length - 1].end.toISOString().slice(0, 10)).toBe("2026-05-07");
  });

  it("retourne [] si start > end (cas dégénéré)", () => {
    const start = new Date("2026-12-31");
    const end = new Date("2026-01-01");
    expect(splitDateRangeIntoChunks(start, end)).toEqual([]);
  });

  it("découpe une fenêtre exactement de 12 mois en 1 chunk (limite inclusive)", () => {
    const start = new Date("2025-05-08");
    const end = new Date("2026-05-07");
    const chunks = splitDateRangeIntoChunks(start, end);
    expect(chunks).toHaveLength(1);
  });
});

describe("clampDateRangeToMaxMonths", () => {
  it("ne modifie pas une fenêtre déjà ≤ 12 mois", () => {
    const start = new Date("2026-01-01");
    const end = new Date("2026-12-31");
    const result = clampDateRangeToMaxMonths(start, end);
    expect(result.start.toISOString()).toBe(start.toISOString());
    expect(result.end.toISOString()).toBe(end.toISOString());
  });

  it("clamp une fenêtre 36 mois aux 12 derniers mois (préserve end)", () => {
    const start = new Date("2023-05-07");
    const end = new Date("2026-05-07");
    const result = clampDateRangeToMaxMonths(start, end);
    expect(result.end.toISOString()).toBe(end.toISOString());
    expect(diffMonths(result.start, result.end)).toBeLessThanOrEqual(MAD_MAX_WINDOW_MONTHS);
    // Le start clampé doit être ≈ end - 12 mois (à 1 jour près pour respecter
    // l'inégalité stricte côté API)
    expect(result.start.toISOString().slice(0, 10)).toBe("2025-05-08");
  });

  it("clamp à 12 mois exactement quand la fenêtre fait 13 mois (limite haute)", () => {
    const start = new Date("2025-04-01");
    const end = new Date("2026-05-01");
    const result = clampDateRangeToMaxMonths(start, end);
    expect(diffMonths(result.start, result.end)).toBeLessThanOrEqual(MAD_MAX_WINDOW_MONTHS);
  });
});
