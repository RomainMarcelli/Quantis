// File: components/dashboard/widgets/LiquidityRatiosWidget.tsx
// Role: widget "Résistance aux imprévus" — trio des ratios de liquidité
// (générale / réduite / immédiate) avec interprétation, tendance, benchmark.
// Reprend le bloc inline historique de FinancingTest.
"use client";

import { useMemo } from "react";
import { formatNumber, INSUFFICIENT_DATA_LABEL } from "@/components/dashboard/formatting";
import { KpiTooltip } from "@/components/kpi/KpiTooltip";
import { KpiBenchmarkAutoIndicator } from "@/components/synthese/KpiBenchmarkAutoIndicator";
import {
  buildLiquidityIndicators, severityClass, type FinancingSeverity,
} from "@/lib/dashboard/financement/financingViewModel";
import type { CalculatedKpis } from "@/types/analysis";

type Props = {
  kpis: CalculatedKpis;
};

export function LiquidityRatiosWidget({ kpis }: Props) {
  const indicators = useMemo(
    () =>
      buildLiquidityIndicators({
        liquiditeGenerale: kpis.liq_gen,
        liquiditeReduite: kpis.liq_red,
        liquiditeImmediate: kpis.liq_imm,
      }),
    [kpis.liq_gen, kpis.liq_red, kpis.liq_imm],
  );

  return (
    <article className="precision-card group flex h-full flex-col rounded-2xl p-6">
      <div className="card-header mb-6">
        <h3 className="text-sm font-semibold text-white">Résistance aux imprévus</h3>
        <div className="mt-2 flex items-center gap-2">
          <span className="tech-tag text-[10px] font-mono uppercase text-white/60">
            Ratios de liquidité
          </span>
          <span className="text-[10px] font-mono text-white/35">LIQUIDITY_COVERAGE</span>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-3">
        {indicators.map((indicator) => (
          <div
            key={indicator.label}
            className="rounded-xl border border-white/5 bg-white/[0.02] p-4 transition-all hover:border-quantis-gold/30 hover:bg-quantis-gold/[0.03]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-widest text-white/55">
                Liquidité {indicator.label}
              </span>
              {indicator.kpiId ? (
                <KpiTooltip kpiId={indicator.kpiId} value={indicator.value} />
              ) : null}
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="tnum text-2xl font-medium text-white">
                {indicator.value === null
                  ? INSUFFICIENT_DATA_LABEL
                  : formatNumber(indicator.value, 2)}
                {indicator.value === null ? null : (
                  <span className="text-sm text-white/35">x</span>
                )}
              </span>
            </div>
            <p className="mt-2 text-xs text-white/65">{indicator.helper}</p>
            <div className="mt-3 flex items-center justify-between gap-2">
              <span
                className={`inline-flex rounded-md border px-2 py-1 text-[11px] ${severityClass(indicator.severity)}`}
              >
                {interpretLabel(indicator.severity)}
              </span>
            </div>
            {indicator.kpiId ? (
              <div className="mt-3">
                <KpiBenchmarkAutoIndicator
                  kpiId={indicator.kpiId}
                  value={indicator.value}
                  kpiLabel={`Liquidité ${indicator.label}`}
                />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </article>
  );
}

function interpretLabel(severity: FinancingSeverity): string {
  if (severity === "good") return "Solide";
  if (severity === "warning") return "Vigilance";
  if (severity === "risk") return "Tension";
  return INSUFFICIENT_DATA_LABEL;
}
