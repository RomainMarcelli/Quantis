// File: lib/dashboard/tabs/valueCreationData.test.ts
// Role: tests unitaires de la préparation des données de graphes (CA mensuel, TMSCV, point mort).
import { describe, expect, it } from "vitest";
import {
  buildBreakEvenModel,
  buildMonthlyRevenueSeries,
  buildTmscvPieData
} from "@/lib/dashboard/tabs/valueCreationData";

describe("buildMonthlyRevenueSeries", () => {
  it("retourne 12 points mensuels", () => {
    const points = buildMonthlyRevenueSeries({
      ca: 120000,
      tcam: 0.12,
      ebe: 24000,
      resultatNet: 12000
    });

    expect(points).toHaveLength(12);
    expect(points[0]?.month).toBe("Jan");
    expect(points[11]?.month).toBe("Déc");
  });
});

describe("buildTmscvPieData", () => {
  it("retourne une décomposition lisible pour un TMSCV positif", () => {
    const pie = buildTmscvPieData(0.32);

    expect(pie).toHaveLength(3);
    expect(pie[0]?.name).toBe("Marge sur coûts variables");
    expect(pie[0]?.actualValue).toBeCloseTo(32, 1);

    const totalVisual = pie.reduce((sum, slice) => sum + slice.value, 0);
    expect(totalVisual).toBeCloseTo(100, 3);
  });

  it("gère un TMSCV négatif avec un segment de déficit", () => {
    const pie = buildTmscvPieData(-0.031);

    expect(pie[0]?.name).toBe("Déficit de marge");
    expect(pie[0]?.actualValue).toBeCloseTo(3.1, 1);
    expect(pie).toHaveLength(3);
  });
});

describe("buildBreakEvenModel", () => {
  it("génère des courbes et un point mort cohérent", () => {
    const model = buildBreakEvenModel({
      ca: 250000,
      chargesFixes: 80000,
      chargesVariables: 0.6,
      pointMort: 200000
    });

    expect(model.points.length).toBeGreaterThanOrEqual(7);
    expect(model.pointMortVolume).toBe(200000);
    expect(model.pointMortValeur).toBe(200000);
  });
});
