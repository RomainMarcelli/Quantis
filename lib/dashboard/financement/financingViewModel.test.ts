// File: lib/dashboard/financement/financingViewModel.test.ts
// Role: vérifie la logique pure de la section Financement (interprétation capacité, liquidité, levier, cash flow).
import { describe, expect, it } from "vitest";
import {
  buildCashFlowSeries,
  buildLiquidityIndicators,
  interpretDebtCapacity,
  interpretLeverage,
  interpretLiquidity
} from "@/lib/dashboard/financement/financingViewModel";

describe("interpretDebtCapacity", () => {
  it("classe en bon statut quand la capacité est faible", () => {
    expect(interpretDebtCapacity(2.4).severity).toBe("good");
  });

  it("classe en risque quand la capacité est élevée", () => {
    expect(interpretDebtCapacity(6.1).severity).toBe("risk");
  });
});

describe("interpretLiquidity", () => {
  it("retourne risk pour un ratio inférieur à 1", () => {
    expect(interpretLiquidity(0.82).severity).toBe("risk");
  });
});

describe("interpretLeverage", () => {
  it("retourne good pour un levier bas", () => {
    expect(interpretLeverage(0.7).severity).toBe("good");
  });

  it("retourne risk pour un levier élevé", () => {
    expect(interpretLeverage(2.8).severity).toBe("risk");
  });
});

describe("buildLiquidityIndicators", () => {
  it("construit les trois indicateurs attendus", () => {
    const indicators = buildLiquidityIndicators({
      liquiditeGenerale: 1.4,
      liquiditeReduite: 1.1,
      liquiditeImmediate: 0.9
    });

    expect(indicators).toHaveLength(3);
    expect(indicators[0]?.label).toBe("Générale");
    expect(indicators[1]?.label).toBe("Réduite");
    expect(indicators[2]?.label).toBe("Immédiate");
  });
});

describe("buildCashFlowSeries", () => {
  it("retourne 12 points mensuels", () => {
    const points = buildCashFlowSeries(50000);

    expect(points).toHaveLength(12);
    expect(points[0]?.month).toBe("Jan");
    expect(points[11]?.month).toBe("Déc");
  });
});
