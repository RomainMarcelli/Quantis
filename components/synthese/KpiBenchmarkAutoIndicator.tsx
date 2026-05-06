// File: components/synthese/KpiBenchmarkAutoIndicator.tsx
// Role: indicateur "branché" qui résout automatiquement le benchmark Vyzor
// pour un KPI donné, à partir de son `kpiId` (id partagé avec le registre KPI).
//
// Conçu pour s'intégrer dans `KpiCardLayout` qui propage déjà `kpiId` + `value`
// sur toutes les cartes du dashboard. Si le `kpiId` n'a pas de mapping Vyzor
// (ex: KPIs banking, point_mort, healthScore...), l'indicateur ne s'affiche pas
// — graceful fallback, aucune erreur visible côté UI.
"use client";

import { KpiBenchmarkIndicator } from "@/components/synthese/KpiBenchmarkIndicator";
import { useBenchmarkContext } from "@/lib/benchmark/BenchmarkContext";
import {
  KPI_BENCHMARK_MAPPING,
  type BenchmarkableKpiKey
} from "@/lib/benchmark/kpiMapping";

type KpiBenchmarkAutoIndicatorProps = {
  /** Id du KPI dans le registre central (lib/kpi/kpiRegistry.ts). */
  kpiId: string;
  value: number | null | undefined;
  /** Override optionnel du libellé affiché dans l'aria-label. */
  kpiLabel?: string;
};

export function KpiBenchmarkAutoIndicator({ kpiId, value, kpiLabel }: KpiBenchmarkAutoIndicatorProps) {
  const { getBenchmarkFor } = useBenchmarkContext();

  // Le mapping est typé sur `keyof CalculatedKpis` — l'id du registre est un
  // string générique. Lecture directe sur l'objet : retourne `undefined` si
  // l'id n'est pas mappé (KPIs banking, point_mort, healthScore...).
  const mapping = KPI_BENCHMARK_MAPPING[kpiId as BenchmarkableKpiKey];
  if (!mapping) {
    return null;
  }

  const numericValue = typeof value === "number" && Number.isFinite(value) ? value : null;
  const benchmark = getBenchmarkFor(kpiId as BenchmarkableKpiKey, numericValue);
  if (!benchmark) {
    return null;
  }

  return (
    <KpiBenchmarkIndicator
      benchmark={benchmark}
      format={mapping.format}
      invertSentiment={mapping.invertSentiment}
      kpiLabel={kpiLabel}
    />
  );
}
