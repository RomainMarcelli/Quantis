// File: components/synthese/KpiBenchmarkAutoIndicator.tsx
// Role: indicateur "branché" qui résout automatiquement le benchmark via le BenchmarkContext.
// À utiliser dans les cartes KPI custom des onglets dashboard pour éviter le prop-drilling.
"use client";

import { KpiBenchmarkIndicator } from "@/components/synthese/KpiBenchmarkIndicator";
import { useBenchmarkContext } from "@/lib/benchmark/BenchmarkContext";
import type { BenchmarkableKpiKey } from "@/lib/benchmark/kpiMapping";

type KpiBenchmarkAutoIndicatorProps = {
  kpiKey: BenchmarkableKpiKey;
  value: number | null;
  // Override optionnel du libellé affiché dans l'aria-label.
  kpiLabel?: string;
};

export function KpiBenchmarkAutoIndicator({ kpiKey, value, kpiLabel }: KpiBenchmarkAutoIndicatorProps) {
  const { getBenchmarkFor, getMappingFor } = useBenchmarkContext();
  const mapping = getMappingFor(kpiKey);
  if (!mapping) {
    return null;
  }
  const benchmark = getBenchmarkFor(kpiKey, value);
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
