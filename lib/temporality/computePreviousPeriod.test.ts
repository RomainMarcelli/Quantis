// File: lib/temporality/computePreviousPeriod.test.ts
// Role: tests unitaires sur le calcul de la période précédente.

import { describe, expect, it } from "vitest";
import { computePreviousPeriod } from "@/lib/temporality/computePreviousPeriod";

describe("computePreviousPeriod", () => {
  it("année pleine 2026 → 2025", () => {
    expect(computePreviousPeriod("2026-01-01", "2026-12-31")).toEqual({
      periodStart: "2025-01-01",
      periodEnd: "2025-12-31",
    });
  });

  it("mois d'avril 2026 → mars 2026", () => {
    expect(computePreviousPeriod("2026-04-01", "2026-04-30")).toEqual({
      periodStart: "2026-03-02",
      periodEnd: "2026-03-31",
    });
  });

  it("trimestre Q2 2026 → 91 jours juste avant", () => {
    // Q2 2026 = 2026-04-01 → 2026-06-30 (91 jours)
    // Précédent = 2026-01-01 → 2026-03-31 (91 jours, soit Q1 exact ici car Q1 a 90j → ajusté à 91 par décalage de 1 jour)
    const result = computePreviousPeriod("2026-04-01", "2026-06-30");
    expect(result).toEqual({
      periodStart: "2025-12-31",
      periodEnd: "2026-03-31",
    });
  });

  it("semaine 17 (semaine du 20-26 avril 2026) → semaine 16", () => {
    expect(computePreviousPeriod("2026-04-20", "2026-04-26")).toEqual({
      periodStart: "2026-04-13",
      periodEnd: "2026-04-19",
    });
  });

  it("période d'1 jour → la veille", () => {
    expect(computePreviousPeriod("2026-04-30", "2026-04-30")).toEqual({
      periodStart: "2026-04-29",
      periodEnd: "2026-04-29",
    });
  });

  it("période sur bascule de mois — comportement duration-based", () => {
    // 2026-02-15 → 2026-03-15 = 29 jours
    // Précédent = 2026-01-17 → 2026-02-14 = 29 jours
    const result = computePreviousPeriod("2026-02-15", "2026-03-15");
    expect(result).toEqual({
      periodStart: "2026-01-17",
      periodEnd: "2026-02-14",
    });
  });

  it("retourne null si bornes invalides", () => {
    expect(computePreviousPeriod("invalid", "2026-04-30")).toBeNull();
    expect(computePreviousPeriod("2026-04-30", "invalid")).toBeNull();
    expect(computePreviousPeriod("", "")).toBeNull();
  });

  it("retourne null si end < start", () => {
    expect(computePreviousPeriod("2026-04-30", "2026-04-01")).toBeNull();
  });
});
