// File: lib/synthese/sectorBenchmark.ts
// Role: fournit un benchmark secteur "version lite" (mock) pour contextualiser les KPI.

type MetricId = "ca" | "ebe" | "cash";

const DEFAULT_BASELINES: Record<MetricId, number> = {
  ca: 150000,
  ebe: 25000,
  cash: 30000
};

const SECTOR_MULTIPLIERS: Record<string, number> = {
  "SaaS & Edition de Logiciels": 1.25,
  "Conseil & Services B2B": 1.05,
  "Agences Marketing & Medias": 0.95,
  "E-commerce & Pure Players": 1.1,
  "Commerce de Detail (Retail)": 0.9,
  "Negoce & Vente de Gros": 1.2,
  "Hotellerie & Restauration": 0.85,
  "Industrie & Manufacturier": 1.15,
  "BTP & Construction": 1.0,
  "Transport & Logistique": 0.92,
  "Sante & Pharmaceutique": 1.3,
  "Immobilier & Gestion d'actifs": 1.18
};

export type SectorBenchmarkInfo = {
  hasData: boolean;
  label: string;
};

export function buildSectorBenchmark(
  metricId: MetricId,
  value: number | null,
  sector: string | null | undefined
): SectorBenchmarkInfo {
  if (value === null || !Number.isFinite(value)) {
    return {
      hasData: false,
      label: "Benchmark indisponible"
    };
  }

  const sectorMultiplier = SECTOR_MULTIPLIERS[sector ?? ""] ?? 1;
  const baseline = DEFAULT_BASELINES[metricId] * sectorMultiplier;
  if (baseline === 0) {
    return {
      hasData: false,
      label: "Benchmark indisponible"
    };
  }

  const deltaPercent = ((value - baseline) / Math.abs(baseline)) * 100;
  if (Math.abs(deltaPercent) < 0.5) {
    return {
      hasData: true,
      label: "Aligné sur la moyenne du secteur"
    };
  }

  const rounded = Math.abs(deltaPercent).toFixed(1);
  return {
    hasData: true,
    label:
      deltaPercent > 0
        ? `${rounded}% supérieur à la moyenne du secteur`
        : `${rounded}% inférieur à la moyenne du secteur`
  };
}
