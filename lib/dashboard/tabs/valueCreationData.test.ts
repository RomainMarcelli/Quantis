// File: lib/dashboard/tabs/valueCreationData.test.ts
// Role: tests unitaires de la préparation des données de graphes (CA mensuel, TMSCV, point mort).
import { describe, expect, it } from "vitest";
import {
  buildBreakEvenModel,
  buildMonthlyRevenueSeries,
  buildTmscvPieData,
  computeBreakEvenMetrics
} from "@/lib/dashboard/tabs/valueCreationData";
import { createEmptyMappedFinancialData } from "@/services/mapping/financialDataMapper";
import type { MappedFinancialData } from "@/types/analysis";

function makeMappedData(overrides: Partial<MappedFinancialData> = {}): MappedFinancialData {
  return {
    ...createEmptyMappedFinancialData(),
    ...overrides
  };
}

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

describe("computeBreakEvenMetrics", () => {
  it("calcule le point mort selon les postes métiers demandés", () => {
    const metrics = computeBreakEvenMetrics(
      makeMappedData({
        ventes_march: 240000,
        prod_vendue: 60000,
        ace: 40000,
        salaires: 50000,
        charges_soc: 20000,
        dap: 10000,
        achats_march: 80000,
        achats_mp: 40000,
        var_stock_march: 5000,
        var_stock_mp: 5000
      })
    );

    expect(metrics.ca).toBe(300000);
    expect(metrics.chargesFixes).toBe(120000);
    expect(metrics.chargesVariables).toBe(130000);
    expect(metrics.mscv).toBe(170000);
    expect(metrics.tmscv).toBeCloseTo(0.566666, 5);
    expect(metrics.pointMort).toBeCloseTo(211764.71, 2);
    expect(metrics.pointMortDateDays).toBeCloseTo(257.65, 2);
    expect(metrics.pointMortDateMonths).toBeCloseTo(8.47, 2);
  });
});

describe("buildBreakEvenModel", () => {
  it("génère une série mensuelle 12 mois + clôture avec une intersection exacte", () => {
    const model = buildBreakEvenModel(
      makeMappedData({
        ventes_march: 240000,
        prod_vendue: 60000,
        ace: 40000,
        salaires: 50000,
        charges_soc: 20000,
        dap: 10000,
        achats_march: 80000,
        achats_mp: 40000,
        var_stock_march: 5000,
        var_stock_mp: 5000
      })
    );

    // 12 points (Mois 1 → Mois 12). Le point "Clôture" séparé a été retiré
    // suite à la simplification UI : la courbe s'arrête franchement au mois 12.
    expect(model.points).toHaveLength(12);
    expect(model.points[0]?.month).toBe("Mois 1");
    expect(model.points[0]?.ca).toBeCloseTo(25000, 2);
    expect(model.points[0]?.fixedCosts).toBe(120000);
    expect(model.points[0]?.totalCosts).toBeCloseTo(130833.33, 2);
    expect(model.points[11]?.month).toBe("Mois 12");
    expect(model.points[11]?.ca).toBe(300000);
    expect(model.points[11]?.totalCosts).toBe(250000);
    expect(model.intersection?.withinFiscalYear).toBe(true);
    expect(model.intersection?.monthIndex).toBeCloseTo(8.47, 2);
    expect(model.intersection?.value).toBeCloseTo(211764.71, 2);
    expect(model.closesAboveBreakEven).toBe(true);
  });

  it("ne crash pas quand les données sont nulles", () => {
    const model = buildBreakEvenModel(makeMappedData());

    expect(model.hasUsableData).toBe(false);
    expect(model.metrics.pointMort).toBeNull();
    expect(model.intersection).toBeNull();
    expect(model.points).toHaveLength(12);
    expect(
      model.points.every((point) => point.ca === 0 && point.fixedCosts === 0 && point.totalCosts === 0)
    ).toBe(true);
  });

  it("signale un point mort non atteignable si la TMSCV est négative", () => {
    const model = buildBreakEvenModel(
      makeMappedData({
        ventes_march: 120000,
        prod_vendue: 0,
        ace: 90000,
        salaires: 50000,
        charges_soc: 30000,
        dap: 10000,
        achats_march: 100000,
        achats_mp: 25000,
        var_stock_march: 0,
        var_stock_mp: 0
      })
    );

    expect(model.metrics.tmscv).toBeLessThan(0);
    expect(model.metrics.pointMort).toBeNull();
    expect(model.intersection).toBeNull();
    expect(model.closesAboveBreakEven).toBe(false);
  });
});
