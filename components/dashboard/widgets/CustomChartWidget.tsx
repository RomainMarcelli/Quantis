// File: components/dashboard/widgets/CustomChartWidget.tsx
// Role: rend un widget personnalisé construit par l'utilisateur via le
// builder de l'onglet "Personnalisé". Combine N séries de KPIs dans un
// même chart, avec :
//   - axes multiples automatiques quand des unités différentes sont mélangées
//     (ex. CA en € à gauche, marge EBITDA en % à droite)
//   - types par série (line ou bar) en mode "mixed" — un chart classique
//     CA en barres + EBITDA en courbe par-dessus
// Les séries sont alimentées depuis `analyses` (annuel) ou
// `currentAnalysis.dailyAccounting` (mensuel) via les helpers existants.
"use client";

import { memo, useMemo } from "react";
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, Tooltip, XAxis, YAxis,
  type TooltipContentProps,
} from "recharts";
import { StableChartContainer } from "@/components/dashboard/widgets/StableChartContainer";
import {
  buildKpiMonthlySeries, buildKpiYearlySeries,
} from "@/lib/synthese/kpiEvolutionSeries";
import { hasMonthlyDataAvailable } from "@/lib/synthese/evolutionSeries";
import { resolveAnalysisFiscalYear } from "@/services/analysisHistory";
import {
  formatCurrency, formatNumber, formatPercent, INSUFFICIENT_DATA_LABEL,
} from "@/components/dashboard/formatting";
import { getKpiDefinition, type KpiUnit } from "@/lib/kpi/kpiRegistry";
import type { AnalysisRecord } from "@/types/analysis";
import type { CustomChartConfig, CustomChartSeries } from "@/types/dashboard";

type CustomChartWidgetProps = {
  config: CustomChartConfig;
  analyses: AnalysisRecord[];
  currentAnalysis: AnalysisRecord | null;
};

// Palette par défaut — alterne or, blanc, vert, orange, bleu.
const PALETTE = ["#C5A059", "#FFFFFF", "#10B981", "#FB923C", "#60A5FA"];

/**
 * Détermine le type de rendu d'une série :
 * - chartType "mixed" → on lit `series.displayType` (default: "line")
 * - sinon : tout le chart prend le type global ("line" / "bar")
 */
function resolveDisplayType(
  series: CustomChartSeries,
  globalType: CustomChartConfig["chartType"],
): "line" | "bar" {
  if (globalType === "mixed") return series.displayType ?? "line";
  if (globalType === "barChart") return "bar";
  return "line";
}

const MONTH_LABELS_FR = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
  "Juil", "Août", "Sep", "Oct", "Nov", "Déc",
];

const isYearlyMode = (config: CustomChartConfig) => config.mode === "yearly";

/**
 * Pour le mode "yearly" : produit un dataset avec X-axis = mois (Jan-Déc),
 * et une clé `year:<YYYY>` par année sélectionnée. Chaque année peut venir
 * d'une analyse différente avec son propre dailyAccounting.
 */
function buildYearlyDataset(
  config: CustomChartConfig,
  analyses: AnalysisRecord[],
): { dataset: Record<string, string | number | null>[]; seriesKeys: { key: string; year: number }[] } {
  const kpiId = config.series[0]?.kpiId;
  const years = config.years ?? [];
  if (!kpiId || years.length === 0) return { dataset: [], seriesKeys: [] };

  // Pour chaque année demandée, on cherche l'analyse correspondante.
  const byYear = new Map<number, AnalysisRecord>();
  for (const a of analyses) {
    const y = resolveAnalysisFiscalYear(a);
    if (y !== null && years.includes(y)) byYear.set(y, a);
  }

  // Dataset : 12 lignes (Jan-Déc), une clé par année.
  const dataset: Record<string, string | number | null>[] = [];
  for (let m = 0; m < 12; m++) {
    const row: Record<string, string | number | null> = {
      key: String(m), label: MONTH_LABELS_FR[m],
    };
    for (const year of years) {
      const a = byYear.get(year);
      if (a) {
        const monthly = buildKpiMonthlySeries(a, kpiId, "all");
        // Cherche le point dont la clé correspond à ce mois (format YYYY-MM).
        const expectedPrefix = `${year}-${String(m + 1).padStart(2, "0")}`;
        const point = monthly.find((p) => p.key === expectedPrefix);
        row[`year:${year}`] = point?.value ?? null;
      } else {
        row[`year:${year}`] = null;
      }
    }
    dataset.push(row);
  }
  return {
    dataset,
    seriesKeys: years.map((y) => ({ key: `year:${y}`, year: y })),
  };
}

function CustomChartWidgetImpl({ config, analyses, currentAnalysis }: CustomChartWidgetProps) {
  const monthlyAvailable = hasMonthlyDataAvailable(currentAnalysis);
  const yearly = isYearlyMode(config);

  // ── Dataset selon le mode ──
  const dataset = useMemo(() => {
    if (yearly) {
      return buildYearlyDataset(config, analyses).dataset;
    }
    if (config.series.length === 0) return [];
    const seriesData = config.series.map((s) =>
      monthlyAvailable && currentAnalysis
        ? buildKpiMonthlySeries(currentAnalysis, s.kpiId, 12)
        : buildKpiYearlySeries(analyses, s.kpiId),
    );
    const reference = seriesData[0] ?? [];
    return reference.map((point, idx) => {
      const merged: Record<string, string | number | null> = {
        key: point.key, label: point.label,
      };
      for (let i = 0; i < config.series.length; i++) {
        const s = config.series[i];
        merged[s.kpiId] = seriesData[i]?.[idx]?.value ?? null;
      }
      return merged;
    });
  }, [yearly, config, monthlyAvailable, analyses, currentAnalysis]);

  const yearlySeriesKeys = useMemo(
    () => yearly ? buildYearlyDataset(config, analyses).seriesKeys : [],
    [yearly, config, analyses],
  );

  const hasData = dataset.length > 0 && (
    yearly
      ? yearlySeriesKeys.some((sk) => dataset.some((p) => p[sk.key] !== null && p[sk.key] !== undefined))
      : config.series.some((s) => dataset.some((p) => p[s.kpiId] !== null && p[s.kpiId] !== undefined))
  );

  // ── Axes multiples automatiques selon les unités distinctes ──
  // En mode yearly : 1 seul KPI → 1 seule unité → axe gauche unique.
  const { unitToAxis, leftUnit, rightUnit } = useMemo(() => {
    if (yearly) {
      const def = getKpiDefinition(config.series[0]?.kpiId ?? "");
      const left = def?.unit ?? "currency";
      return { unitToAxis: {} as Record<string, "left" | "right">, leftUnit: left, rightUnit: null };
    }
    const order: KpiUnit[] = [];
    for (const s of config.series) {
      const def = getKpiDefinition(s.kpiId);
      const unit = def?.unit ?? "currency";
      if (!order.includes(unit)) order.push(unit);
    }
    const left = order[0] ?? "currency";
    const right = order[1] ?? null;
    const map: Record<string, "left" | "right"> = {};
    for (const s of config.series) {
      const def = getKpiDefinition(s.kpiId);
      const unit = def?.unit ?? "currency";
      map[s.kpiId] = unit === left ? "left" : "right";
    }
    return { unitToAxis: map, leftUnit: left, rightUnit: right };
  }, [yearly, config.series]);

  return (
    <article className="precision-card fade-up flex h-full flex-col rounded-2xl p-5">
      <header className="mb-3">
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/45">
          Personnalisé · {config.series.length} série{config.series.length > 1 ? "s" : ""}
        </span>
        <h3 className="text-base font-semibold text-white">{config.title}</h3>
      </header>

      {hasData ? (
        <div className="flex-1 min-h-[200px]">
          <StableChartContainer>
            <ComposedChart data={dataset} margin={{ top: 8, right: 18, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 10, fontFamily: "monospace" }}
                tickLine={false}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
              />
              {/* Y-axis gauche — unité majoritaire (1re série rencontrée) */}
              <YAxis
                yAxisId="left"
                orientation="left"
                tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 10, fontFamily: "monospace" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => formatCompactValue(v, leftUnit)}
                width={50}
              />
              {/* Y-axis droite — uniquement si une 2e unité distincte est présente */}
              {rightUnit ? (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 10, fontFamily: "monospace" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => formatCompactValue(v, rightUnit)}
                  width={50}
                />
              ) : null}
              <Tooltip content={(props) => <CustomTooltip {...props} config={config} />} />
              <Legend
                verticalAlign="bottom" iconType="line" iconSize={8}
                wrapperStyle={{ fontSize: 10, color: "rgba(255,255,255,0.65)", fontFamily: "monospace" }}
              />
              {yearly
                ? // Mode yearly : 1 courbe par année (Jan-Déc en X)
                  yearlySeriesKeys.map((sk, i) => {
                    const color = PALETTE[i % PALETTE.length];
                    return (
                      <Line
                        key={sk.key}
                        yAxisId="left"
                        type="monotone" dataKey={sk.key} name={String(sk.year)}
                        stroke={color} strokeWidth={2.2}
                        dot={{ r: 2.4, fill: color, strokeWidth: 0 }}
                        activeDot={{ r: 5, stroke: color, strokeWidth: 1, fill: "#0f0f12" }}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    );
                  })
                : // Mode séries multi-KPI (current behavior)
                  config.series.map((s, i) => {
                    const def = getKpiDefinition(s.kpiId);
                    const color = s.color ?? PALETTE[i % PALETTE.length];
                    const name = def?.shortLabel ?? def?.label ?? s.kpiId;
                    const axisId = unitToAxis[s.kpiId];
                    const displayType = resolveDisplayType(s, config.chartType);
                    if (displayType === "bar") {
                      return (
                        <Bar
                          key={s.kpiId}
                          yAxisId={axisId}
                          dataKey={s.kpiId} name={name}
                          fill={color} radius={[3, 3, 0, 0]}
                          isAnimationActive={false}
                        />
                      );
                    }
                    return (
                      <Line
                        key={s.kpiId}
                        yAxisId={axisId}
                        type="monotone" dataKey={s.kpiId} name={name}
                        stroke={color} strokeWidth={2.2}
                        dot={{ r: 2.4, fill: color, strokeWidth: 0 }}
                        activeDot={{ r: 5, stroke: color, strokeWidth: 1, fill: "#0f0f12" }}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    );
                  })}
            </ComposedChart>
          </StableChartContainer>
        </div>
      ) : (
        <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
          <p className="max-w-sm text-xs text-white/55">
            Données insuffisantes pour tracer ce widget personnalisé.
          </p>
        </div>
      )}
    </article>
  );
}

function CustomTooltip(props: TooltipContentProps & { config: CustomChartConfig }) {
  const { active, payload, label, config } = props;
  if (!active || !payload || !payload.length) return null;
  const yearly = isYearlyMode(config);
  // En mode yearly : on lit l'unité du SEUL KPI choisi pour TOUS les payloads.
  const yearlyUnit: KpiUnit = yearly
    ? getKpiDefinition(config.series[0]?.kpiId ?? "")?.unit ?? "currency"
    : "currency";
  return (
    <div className="rounded-lg border border-white/15 bg-quantis-base/95 p-3 text-xs text-white/85 shadow-xl backdrop-blur">
      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-white/55">{label}</p>
      <ul className="space-y-1">
        {payload.map((entry, i) => {
          let unit: KpiUnit = "currency";
          let name = "";
          if (yearly) {
            // dataKey = "year:2024" → on extrait l'année comme nom
            const m = String(entry.dataKey ?? "").match(/^year:(\d+)$/);
            name = m ? m[1] : String(entry.dataKey ?? "");
            unit = yearlyUnit;
          } else {
            const series = config.series.find((s) => s.kpiId === entry.dataKey);
            if (!series) return null;
            const def = getKpiDefinition(series.kpiId);
            unit = def?.unit ?? "currency";
            name = def?.shortLabel ?? def?.label ?? series.kpiId;
          }
          const value = typeof entry.value === "number" ? entry.value : null;
          return (
            <li key={i} className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-white/75">
                <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: entry.color }} />
                {name}
              </span>
              <span className="tnum font-medium text-white">{formatTooltipValue(value, unit)}</span>
            </li>
          );
        })}
      </ul>
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

export const CustomChartWidget = memo(CustomChartWidgetImpl);
