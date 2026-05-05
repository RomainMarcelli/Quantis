import { describe, expect, it } from "vitest";
import { buildKpisTimeSeries } from "@/services/integrations/aggregations/kpisTimeSeriesBuilder";
import { fixtureLargeMultiYear } from "@/services/integrations/aggregations/__tests__/fixtures";

describe("kpisTimeSeriesBuilder", () => {
  it("génère 12 snapshots mensuels sur une période d'un an", () => {
    const { entries } = fixtureLargeMultiYear();
    const series = buildKpisTimeSeries({
      entries,
      options: {
        periodStart: new Date("2025-01-01"),
        periodEnd: new Date("2025-12-31"),
      },
    });
    expect(series).toHaveLength(12);
    expect(series[0]?.label).toBe("2025-01");
    expect(series[11]?.label).toBe("2025-12");
    expect(series[0]?.granularity).toBe("month");
  });

  it("chaque snapshot contient un mappedData et des KPI calculés", () => {
    const { entries } = fixtureLargeMultiYear();
    const series = buildKpisTimeSeries({
      entries,
      options: {
        periodStart: new Date("2025-06-01"),
        periodEnd: new Date("2025-08-31"),
      },
    });
    expect(series).toHaveLength(3);
    for (const snap of series) {
      expect(snap.mappedData).toBeDefined();
      expect(snap.kpis).toBeDefined();
      // CA mensuel doit être non-zéro (la fixture a 30 ventes/mois).
      expect(snap.kpis.ca).toBeGreaterThan(0);
    }
  });

  it("dans un mois avec 0 entries, kpis.ca est null sans crash", () => {
    const series = buildKpisTimeSeries({
      entries: [],
      options: {
        periodStart: new Date("2026-01-01"),
        periodEnd: new Date("2026-03-31"),
      },
    });
    expect(series).toHaveLength(3);
    expect(series[0]?.kpis.ca).toBeNull();
    expect(series[1]?.kpis.ca).toBeNull();
    expect(series[2]?.kpis.ca).toBeNull();
  });

  it("évolution mois par mois cohérente sur la fixture multi-année", () => {
    const { entries } = fixtureLargeMultiYear();
    const series = buildKpisTimeSeries({
      entries,
      options: {
        periodStart: new Date("2025-01-01"),
        periodEnd: new Date("2025-12-31"),
      },
    });
    // Tous les mois ont des ventes — ca doit être > 0 partout
    for (const snap of series) {
      expect(snap.kpis.ca).toBeGreaterThan(0);
    }
    // Vérifier la monotonie du bilan (créances cumulent jusqu'à periodEnd croissant)
    const tradeReceivablesByMonth = series.map((s) => s.mappedData.clients ?? 0);
    for (let i = 1; i < tradeReceivablesByMonth.length; i++) {
      expect(tradeReceivablesByMonth[i]!).toBeGreaterThanOrEqual(tradeReceivablesByMonth[i - 1]!);
    }
  });

  it("performance : 12 snapshots sur 800+ entries en moins de 1s", () => {
    const { entries } = fixtureLargeMultiYear();
    const start = Date.now();
    buildKpisTimeSeries({
      entries,
      options: {
        periodStart: new Date("2025-01-01"),
        periodEnd: new Date("2025-12-31"),
      },
    });
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(1000);
  });
});
