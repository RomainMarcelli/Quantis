// File: components/synthese/KpiEvolutionChart.tsx
// Role: graphique d'évolution mono-KPI rendu en haut des onglets dashboard
// (Création de valeur, Investissement, Financement, Rentabilité).
//
// L'utilisateur clique sur n'importe quelle carte KPI dans la page → le KPI
// sélectionné devient l'unique courbe affichée ici. Lecture mensuelle (si
// dailyAccounting) ou annuelle (historique des analyses du dossier).
"use client";

import { memo, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps
} from "recharts";
import { Calendar, TrendingUp } from "lucide-react";
import { StableChartContainer } from "@/components/dashboard/widgets/StableChartContainer";
import type { AnalysisRecord } from "@/types/analysis";
import {
  buildKpiMonthlySeries,
  buildKpiYearlyFromDaily,
  buildKpiYearlySeries,
  type KpiEvolutionPoint
} from "@/lib/synthese/kpiEvolutionSeries";
import {
  filterYearlyByRange,
  hasMonthlyDataAvailable,
  type EvolutionSeriesMode,
  type MonthlyWindow,
  type YearlyRange,
  type EvolutionPoint
} from "@/lib/synthese/evolutionSeries";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  INSUFFICIENT_DATA_LABEL
} from "@/components/dashboard/formatting";
import { getKpiDefinition } from "@/lib/kpi/kpiRegistry";

type KpiEvolutionChartProps = {
  /** id du KPI à tracer (clé du registre central). */
  kpiId: string;
  /** Historique du dossier — alimente le mode annuel. */
  analyses: AnalysisRecord[];
  /** Analyse courante — `dailyAccounting` alimente le mode mensuel. */
  currentAnalysis: AnalysisRecord | null;
};

const COLOR_LINE = "#C5A059"; // or quantis-gold

function KpiEvolutionChartImpl({ kpiId, analyses, currentAnalysis }: KpiEvolutionChartProps) {
  const monthlyAvailable = hasMonthlyDataAvailable(currentAnalysis);
  const definition = getKpiDefinition(kpiId);

  const [mode, setMode] = useState<EvolutionSeriesMode>(monthlyAvailable ? "monthly" : "yearly");
  const [monthlyWindow, setMonthlyWindow] = useState<MonthlyWindow>(12);
  const [yearlyRange, setYearlyRange] = useState<YearlyRange>("5y");

  const series = useMemo<KpiEvolutionPoint[]>(() => {
    if (mode === "monthly" && currentAnalysis) {
      return buildKpiMonthlySeries(currentAnalysis, kpiId, monthlyWindow);
    }
    // En annuel, si l'analyse courante est dynamique, on agrège ses KPIs
    // par année depuis dailyAccounting plutôt que de fallback sur le mix
    // d'analyses statiques de l'historique (incohérent vs mode mensuel).
    const yearly = monthlyAvailable && currentAnalysis
      ? buildKpiYearlyFromDaily(currentAnalysis, kpiId)
      : buildKpiYearlySeries(analyses, kpiId);
    // filterYearlyByRange travaille sur EvolutionPoint (multi-séries), on
    // adapte en wrappant : on transforme la série mono en multi temporaire
    // pour réutiliser la fonction de filtre.
    const wrapped: EvolutionPoint[] = yearly.map((p) => ({
      key: p.key,
      label: p.label,
      ca: p.value,
      ebe: null,
      resultatNet: null
    }));
    return filterYearlyByRange(wrapped, yearlyRange).map((p) => ({
      key: p.key,
      label: p.label,
      value: p.ca
    }));
  }, [mode, monthlyWindow, yearlyRange, analyses, currentAnalysis, kpiId]);

  const hasData = series.some((p) => p.value !== null);
  const unit = definition?.unit ?? "currency";

  const title = definition?.label ?? kpiId;
  const shortLabel = definition?.shortLabel ?? title;

  return (
    <article
      className="precision-card fade-up flex h-full flex-col rounded-2xl p-5"
      data-search-id="dashboard-kpi-evolution-chart"
    >
      <header className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/45">
            Évolution · {shortLabel}
          </span>
          <h3 className="text-base font-semibold text-white">{title}</h3>
        </div>

        {monthlyAvailable ? <ModeToggle mode={mode} onChange={setMode} /> : null}
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {mode === "monthly" ? (
          <PeriodPills
            options={[
              { value: 3, label: "3 mois" },
              { value: 6, label: "6 mois" },
              { value: 12, label: "12 mois" },
              { value: 24, label: "24 mois" },
              { value: "all", label: "Tout" }
            ]}
            value={monthlyWindow}
            onChange={(v) => setMonthlyWindow(v as MonthlyWindow)}
          />
        ) : (
          <PeriodPills
            options={[
              { value: "3y", label: "3 ans" },
              { value: "5y", label: "5 ans" },
              { value: "10y", label: "10 ans" },
              { value: "all", label: "Tout" }
            ]}
            value={yearlyRange}
            onChange={(v) => setYearlyRange(v as YearlyRange)}
          />
        )}
      </div>

      {hasData ? (
        <div className="h-[220px] min-h-[200px]">
          <StableChartContainer>
            <LineChart data={series} margin={{ top: 8, right: 18, bottom: 0, left: 0 }}>
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
                tickFormatter={(v) => formatYAxisValue(v, unit)}
                width={50}
              />
              <Tooltip
                content={(props) => <KpiTooltip {...props} unit={unit} title={title} />}
                cursor={{ stroke: "rgba(197,160,89,0.25)", strokeWidth: 1 }}
              />
              <Line
                type="monotone"
                dataKey="value"
                name={title}
                stroke={COLOR_LINE}
                strokeWidth={2.4}
                dot={{ r: 2.5, fill: COLOR_LINE, strokeWidth: 0 }}
                activeDot={{ r: 5, stroke: COLOR_LINE, strokeWidth: 1, fill: "#0f0f12" }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </StableChartContainer>
        </div>
      ) : (
        <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
          <p className="max-w-sm text-xs text-white/55">
            {analyses.length < 2
              ? "Au moins deux analyses sont nécessaires pour tracer la courbe."
              : `Pas de donnée disponible sur la période sélectionnée pour ${title.toLowerCase()}.`}
          </p>
        </div>
      )}
    </article>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Sub-components réutilisés du chart synthese (toggle + pills) — copie
// locale pour éviter un export/import circulaire avec EvolutionChart.
// ───────────────────────────────────────────────────────────────────────

function ModeToggle({
  mode,
  onChange
}: {
  mode: EvolutionSeriesMode;
  onChange: (next: EvolutionSeriesMode) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-white/10 bg-white/[0.03] p-0.5">
      <button
        type="button"
        onClick={() => onChange("monthly")}
        className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium uppercase tracking-wide transition ${
          mode === "monthly"
            ? "bg-quantis-gold/15 text-quantis-gold"
            : "text-white/55 hover:text-white/80"
        }`}
        aria-pressed={mode === "monthly"}
      >
        <TrendingUp className="h-3 w-3" />
        Mensuel
      </button>
      <button
        type="button"
        onClick={() => onChange("yearly")}
        className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium uppercase tracking-wide transition ${
          mode === "yearly"
            ? "bg-quantis-gold/15 text-quantis-gold"
            : "text-white/55 hover:text-white/80"
        }`}
        aria-pressed={mode === "yearly"}
      >
        <Calendar className="h-3 w-3" />
        Annuel
      </button>
    </div>
  );
}

type PillOption<T extends string | number> = { value: T; label: string };

function PeriodPills<T extends string | number>({
  options,
  value,
  onChange
}: {
  options: PillOption<T>[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-wide transition ${
            value === opt.value
              ? "bg-white/10 text-white"
              : "text-white/45 hover:text-white/70"
          }`}
          aria-pressed={value === opt.value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Tooltip + formatting unit-aware (€, %, jours, ratio)
// ───────────────────────────────────────────────────────────────────────

type KpiUnit = ReturnType<typeof getKpiDefinition> extends infer T
  ? T extends { unit: infer U } ? U : "currency"
  : "currency";

function KpiTooltip(props: TooltipContentProps & { unit: KpiUnit; title: string }) {
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

function formatYAxisValue(value: number, unit: KpiUnit): string {
  if (!Number.isFinite(value)) return "";
  if (unit === "percent") return `${Math.round(value)}%`;
  if (unit === "days") return `${Math.round(value)}j`;
  if (unit === "ratio" || unit === "score") return value.toFixed(1);
  // currency par défaut, format compact
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

export const KpiEvolutionChart = memo(KpiEvolutionChartImpl);
