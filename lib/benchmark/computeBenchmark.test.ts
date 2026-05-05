// File: lib/benchmark/computeBenchmark.test.ts
import { describe, expect, it } from "vitest";
import {
  computeDeltaVsP50Pct,
  computeKpiBenchmark,
  extractPercentiles,
  resolvePosition
} from "@/lib/benchmark/computeBenchmark";
import type { VyzorBenchmarkRow } from "@/types/benchmark";
import { KPI_BENCHMARK_MAPPING } from "@/lib/benchmark/kpiMapping";

const baseRow: Partial<VyzorBenchmarkRow> = {
  ca_bas: 100_000,
  ca_median: 200_000,
  ca_haut: 500_000
};

describe("resolvePosition", () => {
  const percentiles = { p25: 100, p50: 200, p75: 500 };

  it("classe au-dessus du P75 quand la valeur dépasse le top quartile", () => {
    expect(resolvePosition(600, percentiles)).toBe("above_p75");
  });

  it("classe entre P50 et P75 quand la valeur est dans le 3e quartile", () => {
    expect(resolvePosition(300, percentiles)).toBe("between_p50_p75");
  });

  it("classe entre P25 et P50 quand la valeur est dans le 2e quartile", () => {
    expect(resolvePosition(150, percentiles)).toBe("between_p25_p50");
  });

  it("classe sous le P25 quand la valeur est dans le bas du panel", () => {
    expect(resolvePosition(50, percentiles)).toBe("below_p25");
  });

  it("inclut la borne supérieure dans above_p75 (>= P75)", () => {
    expect(resolvePosition(500, percentiles)).toBe("above_p75");
  });

  it("inclut la borne médiane dans between_p50_p75 (>= P50)", () => {
    expect(resolvePosition(200, percentiles)).toBe("between_p50_p75");
  });
});

describe("computeDeltaVsP50Pct", () => {
  it("retourne le pourcentage d'écart vs la médiane", () => {
    expect(computeDeltaVsP50Pct(220, 200)).toBe(10);
    expect(computeDeltaVsP50Pct(180, 200)).toBe(-10);
  });

  it("retourne 0 quand p50 est 0 (pas de division par zéro)", () => {
    expect(computeDeltaVsP50Pct(50, 0)).toBe(0);
  });

  it("utilise la valeur absolue de p50 pour gérer les médianes négatives", () => {
    // p50 = -100, valeur 0 → +100% (la valeur est meilleure que p50 de 100% en magnitude)
    expect(computeDeltaVsP50Pct(0, -100)).toBe(100);
  });
});

describe("extractPercentiles", () => {
  const caMapping = KPI_BENCHMARK_MAPPING.ca!;

  it("extrait le triplet quand toutes les colonnes sont présentes", () => {
    expect(extractPercentiles(baseRow as VyzorBenchmarkRow, caMapping)).toEqual({
      p25: 100_000,
      p50: 200_000,
      p75: 500_000
    });
  });

  it("retourne null quand la row est null", () => {
    expect(extractPercentiles(null, caMapping)).toBeNull();
  });

  it("retourne null quand la médiane est null (panel vide)", () => {
    const row = { ...baseRow, ca_median: null } as VyzorBenchmarkRow;
    expect(extractPercentiles(row, caMapping)).toBeNull();
  });
});

describe("computeKpiBenchmark", () => {
  const percentiles = { p25: 100, p50: 200, p75: 500 };

  it("retourne null quand la valeur entreprise est manquante", () => {
    expect(computeKpiBenchmark(null, percentiles)).toBeNull();
  });

  it("retourne null quand les percentiles sont absents", () => {
    expect(computeKpiBenchmark(150, null)).toBeNull();
  });

  it("retourne null quand la valeur n'est pas finie (NaN, Infinity)", () => {
    expect(computeKpiBenchmark(Number.NaN, percentiles)).toBeNull();
    expect(computeKpiBenchmark(Number.POSITIVE_INFINITY, percentiles)).toBeNull();
  });

  it("compose position + delta + percentiles dans un objet KpiBenchmark complet", () => {
    const result = computeKpiBenchmark(220, percentiles);
    expect(result).toEqual({
      value: 220,
      percentiles,
      position: "between_p50_p75",
      deltaVsP50Pct: 10
    });
  });
});
