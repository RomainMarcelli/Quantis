// File: components/dashboard/widgets/ComparisonWidget.tsx
// Role: widget "comparaison marché" — version étendue de l'indicateur 3 cercles
// avec affichage explicite des percentiles P25 / P50 / P75 du panel sectoriel
// Vyzor + position absolue de la valeur entreprise sur l'axe.
"use client";

import { memo } from "react";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  INSUFFICIENT_DATA_LABEL
} from "@/components/dashboard/formatting";
import { useBenchmarkContext } from "@/lib/benchmark/BenchmarkContext";
import {
  KPI_BENCHMARK_MAPPING,
  type BenchmarkableKpiKey
} from "@/lib/benchmark/kpiMapping";
import { getKpiDefinition } from "@/lib/kpi/kpiRegistry";
import type { BenchmarkValueFormat } from "@/types/benchmark";
import type { CalculatedKpis } from "@/types/analysis";

type ComparisonWidgetProps = {
  kpiId: string;
  kpis: CalculatedKpis;
};

function ComparisonWidgetImpl({ kpiId, kpis }: ComparisonWidgetProps) {
  const definition = getKpiDefinition(kpiId);
  const value = readKpiValue(kpis, kpiId);
  const mapping = KPI_BENCHMARK_MAPPING[kpiId as BenchmarkableKpiKey];
  const { getBenchmarkFor } = useBenchmarkContext();
  const benchmark = mapping ? getBenchmarkFor(kpiId as BenchmarkableKpiKey, value) : null;
  const title = definition?.label ?? kpiId;
  const shortLabel = definition?.shortLabel ?? kpiId;

  const noData = !mapping || !benchmark;

  return (
    <article className="precision-card fade-up flex h-full flex-col rounded-2xl p-5">
      <header className="mb-3">
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/45">
          Comparaison marché · {shortLabel}
        </span>
        <h3 className="text-base font-semibold text-white">{title}</h3>
      </header>

      {noData ? (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
          <p className="max-w-xs text-xs text-white/55">
            Pas de benchmark sectoriel disponible pour ce KPI.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Bandeau valeur entreprise */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <p className="text-[10px] font-mono uppercase tracking-wide text-white/45">Votre valeur</p>
            <p className="tnum mt-1 text-2xl font-semibold text-white">
              {formatBenchmarkValue(benchmark.value, mapping.format)}
            </p>
            <p className={`mt-1 text-xs ${deltaColorClass(benchmark.deltaVsP50Pct)}`}>
              {formatDeltaMessage(benchmark.deltaVsP50Pct)}
            </p>
          </div>

          {/* Tableau P25 / P50 / P75 */}
          <div className="grid grid-cols-3 gap-2">
            <PercentileTile
              label="P25 — Bas"
              value={benchmark.percentiles.p25}
              format={mapping.format}
              tone="negative"
            />
            <PercentileTile
              label="P50 — Médiane"
              value={benchmark.percentiles.p50}
              format={mapping.format}
              tone="neutral"
            />
            <PercentileTile
              label="P75 — Haut"
              value={benchmark.percentiles.p75}
              format={mapping.format}
              tone="positive"
            />
          </div>

          {/* Position visuelle : barre horizontale segmentée + curseur */}
          <PositionBar
            value={benchmark.value}
            p25={benchmark.percentiles.p25}
            p50={benchmark.percentiles.p50}
            p75={benchmark.percentiles.p75}
            invertSentiment={mapping.invertSentiment}
          />
        </div>
      )}
    </article>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────

function PercentileTile({
  label,
  value,
  format,
  tone
}: {
  label: string;
  value: number;
  format: BenchmarkValueFormat;
  tone: "positive" | "neutral" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "border-emerald-400/30 bg-emerald-500/5"
      : tone === "negative"
        ? "border-rose-400/30 bg-rose-500/5"
        : "border-amber-400/30 bg-amber-500/5";
  const labelClass =
    tone === "positive"
      ? "text-emerald-300"
      : tone === "negative"
        ? "text-rose-300"
        : "text-amber-200";
  return (
    <div className={`rounded-lg border ${toneClass} p-3 text-center`}>
      <p className={`text-[10px] font-mono uppercase tracking-wide ${labelClass}`}>{label}</p>
      <p className="tnum mt-1 text-sm font-semibold text-white">
        {formatBenchmarkValue(value, format)}
      </p>
    </div>
  );
}

function PositionBar({
  value,
  p25,
  p50,
  p75,
  invertSentiment
}: {
  value: number;
  p25: number;
  p50: number;
  p75: number;
  invertSentiment: boolean;
}) {
  // Calcule la position du curseur (0 → 1) en bornant l'axe sur p25/p75.
  const min = Math.min(p25, value, p25 - (p75 - p25) * 0.3);
  const max = Math.max(p75, value, p75 + (p75 - p25) * 0.3);
  const span = Math.max(max - min, 1);
  const cursorRatio = (value - min) / span;
  const p25Ratio = (p25 - min) / span;
  const p50Ratio = (p50 - min) / span;
  const p75Ratio = (p75 - min) / span;

  // Couleurs des segments — flippe si invertSentiment.
  const leftColor = invertSentiment ? "#10B981" : "#FB7185"; // bas du panel
  const rightColor = invertSentiment ? "#FB7185" : "#10B981"; // haut du panel

  return (
    <div className="space-y-2">
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-white/5">
        <div
          className="absolute left-0 top-0 h-full"
          style={{ width: `${p25Ratio * 100}%`, backgroundColor: `${leftColor}55` }}
        />
        <div
          className="absolute top-0 h-full"
          style={{
            left: `${p25Ratio * 100}%`,
            width: `${(p75Ratio - p25Ratio) * 100}%`,
            backgroundColor: "rgba(255,255,255,0.08)"
          }}
        />
        <div
          className="absolute top-0 h-full"
          style={{
            left: `${p75Ratio * 100}%`,
            width: `${(1 - p75Ratio) * 100}%`,
            backgroundColor: `${rightColor}55`
          }}
        />
        {/* Tick P50 */}
        <div
          className="absolute top-0 h-full w-px bg-amber-200/60"
          style={{ left: `${p50Ratio * 100}%` }}
        />
        {/* Curseur valeur */}
        <div
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-quantis-base bg-quantis-gold shadow-[0_0_10px_rgba(197,160,89,0.85)]"
          style={{ left: `${Math.min(Math.max(cursorRatio, 0), 1) * 100}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[10px] font-mono text-white/45">
        <span>← Bas du panel</span>
        <span>Haut du panel →</span>
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────

function readKpiValue(kpis: CalculatedKpis | null | undefined, kpiId: string): number | null {
  if (!kpis) return null;
  const value = (kpis as unknown as Record<string, number | null | undefined>)[kpiId];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatBenchmarkValue(value: number, format: BenchmarkValueFormat): string {
  switch (format) {
    case "currency":
      return formatCurrency(value);
    case "percent":
      return formatPercent(value);
    case "days":
      return `${formatNumber(value, 1)} j`;
    case "ratio":
      return formatNumber(value, 2);
    case "headcount":
      return `${formatNumber(value, 1)} ETP`;
    default:
      return formatNumber(value);
  }
}

function deltaColorClass(deltaPct: number): string {
  if (Math.abs(deltaPct) < 1) return "text-white/55";
  return deltaPct > 0 ? "text-emerald-300" : "text-rose-300";
}

function formatDeltaMessage(deltaPct: number): string {
  if (Math.abs(deltaPct) < 1) return "Aligné sur la médiane marché";
  const rounded = Math.abs(deltaPct).toFixed(1);
  return deltaPct > 0
    ? `${rounded}% au-dessus de la médiane marché`
    : `${rounded}% en-dessous de la médiane marché`;
}

void INSUFFICIENT_DATA_LABEL;

export const ComparisonWidget = memo(ComparisonWidgetImpl);
