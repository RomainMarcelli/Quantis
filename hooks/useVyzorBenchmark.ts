// File: hooks/useVyzorBenchmark.ts
// Role: charge la row Vyzor depuis /api/benchmark et expose un helper getBenchmarkFor(kpi, value).
"use client";

import { useCallback, useEffect, useState } from "react";
import type { KpiBenchmark, VyzorBenchmarkRow } from "@/types/benchmark";
import { computeKpiBenchmark, extractPercentiles } from "@/lib/benchmark/computeBenchmark";
import { getMappingFor, type BenchmarkableKpiKey, type KpiBenchmarkMapping } from "@/lib/benchmark/kpiMapping";

type State = {
  row: VyzorBenchmarkRow | null;
  isLoading: boolean;
  error: string | null;
};

export type UseVyzorBenchmarkResult = State & {
  getBenchmarkFor: (kpiKey: BenchmarkableKpiKey, value: number | null) => KpiBenchmark | null;
  getMappingFor: (kpiKey: BenchmarkableKpiKey) => KpiBenchmarkMapping | null;
};

export function useVyzorBenchmark(): UseVyzorBenchmarkResult {
  const [state, setState] = useState<State>({ row: null, isLoading: true, error: null });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/benchmark", { method: "GET" });
        if (!response.ok) {
          if (!cancelled) {
            setState({ row: null, isLoading: false, error: `HTTP ${response.status}` });
          }
          return;
        }
        const payload = (await response.json()) as { row?: VyzorBenchmarkRow };
        if (!cancelled) {
          setState({ row: payload.row ?? null, isLoading: false, error: null });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            row: null,
            isLoading: false,
            error: error instanceof Error ? error.message : "fetch failed"
          });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const getBenchmarkFor = useCallback(
    (kpiKey: BenchmarkableKpiKey, value: number | null): KpiBenchmark | null => {
      const mapping = getMappingFor(kpiKey);
      if (!mapping) {
        return null;
      }
      const percentiles = extractPercentiles(state.row, mapping);
      return computeKpiBenchmark(value, percentiles);
    },
    [state.row]
  );

  return {
    ...state,
    getBenchmarkFor,
    getMappingFor
  };
}
