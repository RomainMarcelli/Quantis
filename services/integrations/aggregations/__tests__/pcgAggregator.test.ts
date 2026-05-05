import { describe, expect, it } from "vitest";
import { aggregateEntriesToParsedFinancialData } from "@/services/integrations/aggregations/pcgAggregator";
import {
  fixtureLargeMultiYear,
  fixtureRefunds,
  fixtureMultiCurrency,
  fixtureEdgeCases,
} from "@/services/integrations/aggregations/__tests__/fixtures";

describe("pcgAggregator", () => {
  it("agrège correctement 800+ écritures sur 2 exercices avec comptes 6 chiffres", () => {
    const { entries } = fixtureLargeMultiYear();
    const result = aggregateEntriesToParsedFinancialData(entries, {
      periodStart: new Date("2025-01-01"),
      periodEnd: new Date("2025-12-31"),
      previousPeriodStart: new Date("2024-01-01"),
      previousPeriodEnd: new Date("2024-12-31"),
    });

    // 30 ventes × 12 mois = 360 ventes — comptes 701100 → mappé en productionSoldGoods.
    expect(result.incomeStatement.productionSoldGoods).toBeGreaterThan(0);
    // 20 achats × 12 mois × ~225€ moyens = ~54000€ → comptes 601100 → rawMaterialPurchases.
    expect(result.incomeStatement.rawMaterialPurchases).toBeGreaterThan(0);
    // CA = productionSold (701x reconnu via prefix "701")
    expect(result.incomeStatement.netTurnover).toBe(result.incomeStatement.productionSoldGoods);
  });

  it("traite les avoirs en compte négatif (réduit le CA)", () => {
    const { entries } = fixtureRefunds();
    const result = aggregateEntriesToParsedFinancialData(entries, {
      periodStart: new Date("2026-01-01"),
      periodEnd: new Date("2026-12-31"),
    });
    // Ventes 1000 - avoir 300 = 700 net
    expect(result.incomeStatement.salesGoods).toBe(700);
  });

  it("compte des montants tels quels même en multi-devises (montants déjà convertis)", () => {
    const { entries } = fixtureMultiCurrency();
    const result = aggregateEntriesToParsedFinancialData(entries, {
      periodStart: new Date("2026-01-01"),
      periodEnd: new Date("2026-12-31"),
    });
    // EUR 1000 + USD-converti 850 = 1850 sur compte 707 (salesGoods)
    expect(result.incomeStatement.salesGoods).toBe(1850);
  });

  it("skippe les lignes sans compte et les montants NaN sans crasher", () => {
    const { entries } = fixtureEdgeCases();
    expect(() =>
      aggregateEntriesToParsedFinancialData(entries, {
        periodStart: new Date("2026-01-01"),
        periodEnd: new Date("2026-12-31"),
      })
    ).not.toThrow();
    const result = aggregateEntriesToParsedFinancialData(entries, {
      periodStart: new Date("2026-01-01"),
      periodEnd: new Date("2026-12-31"),
    });
    // La vente valide sur 707 (500€) doit être prise même si TVA nulle.
    expect(result.incomeStatement.salesGoods).toBe(500);
  });

  it("filtre correctement par période (income statement) et cumule jusqu'à periodEnd (bilan)", () => {
    const { entries } = fixtureLargeMultiYear();
    // Période = janvier 2025 uniquement
    const result = aggregateEntriesToParsedFinancialData(entries, {
      periodStart: new Date("2025-01-01"),
      periodEnd: new Date("2025-01-31"),
    });
    // P&L : ~30 ventes × 1 mois (pas plus)
    const ventesJanvier = result.incomeStatement.productionSoldGoods ?? 0;
    expect(ventesJanvier).toBeGreaterThan(0);
    expect(ventesJanvier).toBeLessThan(50000); // sanity : 1 mois pas 12

    // Bilan : capital + emprunt + banque (à-nouveau au 1er janvier)
    expect(result.balanceSheet.shareCapital).toBe(50000);
    expect(result.balanceSheet.borrowings).toBe(30000);
  });

  it("calcule netTurnoverPreviousYear à partir des entries N-1 si la période est fournie", () => {
    const { entries } = fixtureLargeMultiYear();
    const result = aggregateEntriesToParsedFinancialData(entries, {
      periodStart: new Date("2026-01-01"),
      periodEnd: new Date("2026-04-30"),
      previousPeriodStart: new Date("2025-01-01"),
      previousPeriodEnd: new Date("2025-12-31"),
    });
    expect(result.incomeStatement.netTurnoverPreviousYear).toBeGreaterThan(0);
  });

  it("performance : 800+ entries traitées en moins de 100ms", () => {
    const { entries } = fixtureLargeMultiYear();
    const start = Date.now();
    aggregateEntriesToParsedFinancialData(entries, {
      periodStart: new Date("2025-01-01"),
      periodEnd: new Date("2026-12-31"),
    });
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100);
  });
});
