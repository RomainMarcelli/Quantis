// File: lib/dashboard/rentabilite/rentabilityViewModel.test.ts
// Role: vérifie la logique pure de la section Rentabilité (normalisation, tendance, levier).
import { describe, expect, it } from "vitest";
import {
  buildSignTrend,
  buildRentabilitySeries,
  computeTrend,
  interpretLeverage,
  normalizePercentInput,
  trendClass
} from "@/lib/dashboard/rentabilite/rentabilityViewModel";

describe("rentabilityViewModel", () => {
  it("normalise un ratio en pourcentage", () => {
    expect(normalizePercentInput(0.25)).toBe(25);
    expect(normalizePercentInput(12)).toBe(12);
  });

  it("retourne une tendance haussière quand le dernier point dépasse l'avant-dernier", () => {
    const trend = computeTrend([
      { month: "Jan", value: 10 },
      { month: "Fév", value: 12 }
    ]);

    expect(trend.direction).toBe("up");
    expect(trend.label).toContain("Hausse");
  });

  it("associe une classe visuelle rouge pour une tendance en baisse", () => {
    expect(trendClass("down")).toContain("rose");
  });

  it("applique une tendance baissière quand le KPI est négatif", () => {
    const trend = buildSignTrend(-0.2);
    expect(trend.direction).toBe("down");
    expect(trend.label).toContain("négative");
  });

  it("génère 12 points mensuels pour le graphique ROE", () => {
    const series = buildRentabilitySeries(0.18, "roe");
    expect(series).toHaveLength(12);
    expect(series[0]?.month).toBe("Jan");
  });

  it("interprète un levier élevé comme une dépendance forte", () => {
    const interpretation = interpretLeverage(2.4);
    expect(interpretation.status).toBe("risk");
    expect(interpretation.label).toContain("Dépendance");
  });
});
