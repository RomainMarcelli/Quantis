// File: components/dashboard/widgets/BarChartWidget.tsx
// Role: widget "histogramme" pour visualiser l'évolution d'un KPI sous forme
// de barres (alternative à LineChart). Utile pour les variables additives où
// la lecture par période est plus parlante en barres (CA mensuel, EBE annuel).
"use client";

import { memo, useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps
} from "recharts";
import {
  buildKpiMonthlySeries,
  buildKpiYearlySeries,
  type KpiEvolutionPoint
} from "@/lib/synthese/kpiEvolutionSeries";
import {
  filterYearlyByRange,
  hasMonthlyDataAvailable,
  type YearlyRange,
  type EvolutionPoint
} from "@/lib/synthese/evolutionSeries";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  INSUFFICIENT_DATA_LABEL
} from "@/components/dashboard/formatting";
import { getKpiDefinition, type KpiUnit } from "@/lib/kpi/kpiRegistry";
import { StableChartContainer } from "@/components/dashboard/widgets/StableChartContainer";
import type { AnalysisRecord } from "@/types/analysis";

type BarChartWidgetProps = {
  kpiId: string;
  analyses: AnalysisRecord[];
  currentAnalysis: AnalysisRecord | null;
};

const COLOR_BAR = "#C5A059";

function BarChartWidgetImpl({ kpiId, analyses, currentAnalysis }: BarChartWidgetProps) {
  const monthlyAvailable = hasMonthlyDataAvailable(currentAnalysis);
  const definition = getKpiDefinition(kpiId);

  const series: KpiEvolutionPoint[] = useMemo(() => {
    if (monthlyAvailable && currentAnalysis) {
      return buildKpiMonthlySeries(currentAnalysis, kpiId, 12);
    }
    const yearly = buildKpiYearlySeries(analyses, kpiId);
    const wrapped: EvolutionPoint[] = yearly.map((p) => ({
      key: p.key,
      label: p.label,
      ca: p.value,
      ebe: null,
      resultatNet: null
    }));
    return filterYearlyByRange(wrapped, "5y" as YearlyRange).map((p) => ({
      key: p.key,
      label: p.label,
      value: p.ca
    }));
  }, [monthlyAvailable, analyses, currentAnalysis, kpiId]);

  const hasData = series.some((p) => p.value !== null);
  const unit = definition?.unit ?? "currency";
  const title = definition?.label ?? kpiId;

  return (
    <article className="precision-card fade-up flex h-full flex-col rounded-2xl p-5">
      <header className="mb-3">
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/45">
          Histogramme · {definition?.shortLabel ?? kpiId}
        </span>
        <h3 className="text-base font-semibold text-white">{title}</h3>
      </header>

      {hasData ? (
        <div className="h-[200px]">
          <StableChartContainer>
            <BarChart data={series} margin={{ top: 8, right: 18, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 10, fontFamily: "monospace" }}
                tickLine={false}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
              />
              <YAxis
                tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 10, fontFamily: "monospace" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => formatCompactValue(v, unit)}
                width={50}
              />
              <Tooltip
                content={(props) => <BarTooltip {...props} unit={unit} title={title} />}
                cursor={{ fill: "rgba(197,160,89,0.08)" }}
              />
              <Bar dataKey="value" fill={COLOR_BAR} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </StableChartContainer>
        </div>
      ) : (
        <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
          <p className="text-xs text-white/55">Pas assez de points historiques pour tracer la courbe.</p>
        </div>
      )}
    </article>
  );
}

function BarTooltip(props: TooltipContentProps & { unit: KpiUnit; title: string }) {
  const { active, payload, label, unit, title } = props;
  if (!active || !payload || !payload.length) return null;
  const value = typeof payload[0].value === "number" ? payload[0].value : null;
  return (
    <div className="rounded-lg border border-white/15 bg-quantis-base/95 p-3 text-xs text-white/85 shadow-xl backdrop-blur">
      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-white/55">{label}</p>
      <div className="flex items-center justify-between gap-3">
        <span className="text-white/70">{title}</span>
        <span className="tnum font-medium text-white">{formatTooltipValue(value, unit)}</span>
      </div>
    </div>
  );
}

function formatCompactValue(value: number, unit: KpiUnit): string {
  if (!Number.isFinite(value)) return "";
  if (unit === "percent") return `${Math.round(value)}%`;
  if (unit === "days") return `${Math.round(value)}j`;
  if (unit === "ratio" || unit === "score") return value.toFixed(1);
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} M`;
  if (abs >= 1_000) return `${Math.round(value / 1_000)} k`;
  return String(Math.round(value));
}

function formatTooltipValue(value: number | null, unit: KpiUnit): string {
  if (value === null || !Number.isFinite(value)) return INSUFFICIENT_DATA_LABEL;
  if (unit === "currency") return formatCurrency(value);
  if (unit === "percent") return formatPercent(value);
  if (unit === "days") return `${formatNumber(value, 1)} j`;
  if (unit === "ratio" || unit === "score") return formatNumber(value, 2);
  return formatNumber(value);
}

export const BarChartWidget = memo(BarChartWidgetImpl);
