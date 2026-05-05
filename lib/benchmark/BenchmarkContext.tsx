// File: lib/benchmark/BenchmarkContext.tsx
// Role: provider React qui charge la row Vyzor une seule fois et expose un helper getBenchmarkFor
// consommable depuis n'importe quel KPI sans prop-drilling.
"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { KpiBenchmark } from "@/types/benchmark";
import { useVyzorBenchmark } from "@/hooks/useVyzorBenchmark";
import type { BenchmarkableKpiKey } from "@/lib/benchmark/kpiMapping";
import { getMappingFor, type KpiBenchmarkMapping } from "@/lib/benchmark/kpiMapping";

type BenchmarkContextValue = {
  isLoading: boolean;
  error: string | null;
  getBenchmarkFor: (kpiKey: BenchmarkableKpiKey, value: number | null) => KpiBenchmark | null;
  getMappingFor: (kpiKey: BenchmarkableKpiKey) => KpiBenchmarkMapping | null;
};

const BenchmarkContext = createContext<BenchmarkContextValue | null>(null);

export function VyzorBenchmarkProvider({ children }: { children: ReactNode }) {
  const { isLoading, error, getBenchmarkFor } = useVyzorBenchmark();

  const value = useMemo<BenchmarkContextValue>(
    () => ({
      isLoading,
      error,
      getBenchmarkFor,
      getMappingFor
    }),
    [isLoading, error, getBenchmarkFor]
  );

  return <BenchmarkContext.Provider value={value}>{children}</BenchmarkContext.Provider>;
}

// Consommateur silencieux : si aucun provider n'est monté, retourne un fallback no-op
// pour ne pas casser les composants qui peuvent être rendus dans d'autres contextes.
export function useBenchmarkContext(): BenchmarkContextValue {
  const value = useContext(BenchmarkContext);
  if (value) {
    return value;
  }
  return {
    isLoading: false,
    error: null,
    getBenchmarkFor: () => null,
    getMappingFor
  };
}

export function useBenchmarkFor(kpiKey: BenchmarkableKpiKey, value: number | null): KpiBenchmark | null {
  const { getBenchmarkFor } = useBenchmarkContext();
  return getBenchmarkFor(kpiKey, value);
}
