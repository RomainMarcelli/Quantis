// File: lib/benchmark/computeBenchmark.ts
// Role: fonctions pures pour calculer la position d'une valeur entreprise vs les percentiles marché.
import type {
  BenchmarkPosition,
  KpiBenchmark,
  VyzorBenchmarkRow,
  VyzorPercentiles
} from "@/types/benchmark";
import type { KpiBenchmarkMapping } from "@/lib/benchmark/kpiMapping";

export function extractPercentiles(
  row: VyzorBenchmarkRow | null,
  mapping: KpiBenchmarkMapping
): VyzorPercentiles | null {
  if (!row) {
    return null;
  }

  const p25 = row[mapping.columns.bas];
  const p50 = row[mapping.columns.median];
  const p75 = row[mapping.columns.haut];

  if (p25 === null || p50 === null || p75 === null) {
    return null;
  }

  if (!Number.isFinite(p25) || !Number.isFinite(p50) || !Number.isFinite(p75)) {
    return null;
  }

  return { p25, p50, p75 };
}

export function resolvePosition(value: number, percentiles: VyzorPercentiles): BenchmarkPosition {
  if (value >= percentiles.p75) {
    return "above_p75";
  }
  if (value >= percentiles.p50) {
    return "between_p50_p75";
  }
  if (value >= percentiles.p25) {
    return "between_p25_p50";
  }
  return "below_p25";
}

export function computeDeltaVsP50Pct(value: number, p50: number): number {
  if (p50 === 0) {
    return 0;
  }
  return ((value - p50) / Math.abs(p50)) * 100;
}

export function computeKpiBenchmark(
  value: number | null,
  percentiles: VyzorPercentiles | null
): KpiBenchmark | null {
  if (value === null || !Number.isFinite(value) || !percentiles) {
    return null;
  }

  return {
    value,
    percentiles,
    position: resolvePosition(value, percentiles),
    deltaVsP50Pct: computeDeltaVsP50Pct(value, percentiles.p50)
  };
}
