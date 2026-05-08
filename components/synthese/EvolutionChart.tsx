// File: components/synthese/EvolutionChart.tsx
// Role: graphique d'évolution synthese (CA, EBE, Résultat Net) avec deux lectures :
// - Mensuel (dynamique) : recalcule via dailyAccounting si dispo (Pennylane / MyUnisoft / Odoo)
// - Annuel (statique) : lit l'historique des analyses du dossier (uploads PDF + syncs annuels)
//
// L'UI s'adapte automatiquement à la donnée disponible :
// - Si l'analyse courante a des écritures journalières → mode Mensuel par défaut + toggle Annuel
// - Sinon → uniquement Annuel (toggle masqué)
//
// Le filtre période n'apparaît que dans le mode actif :
// - Mensuel : 6 mois / 12 mois / 24 mois
// - Annuel  : 3 ans / 5 ans / Tout l'historique
"use client";

import { memo, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps
} from "recharts";
import { Calendar, TrendingUp } from "lucide-react";
import { StableChartContainer } from "@/components/dashboard/widgets/StableChartContainer";
import { useTheme } from "@/hooks/useTheme";
import type { AnalysisRecord } from "@/types/analysis";
import {
  buildMonthlySeries,
  buildYearlySeries,
  filterYearlyByRange,
  hasMonthlyDataAvailable,
  type EvolutionPoint,
  type EvolutionSeriesMode,
  type MonthlyWindow,
  type YearlyRange
} from "@/lib/synthese/evolutionSeries";
import { INSUFFICIENT_DATA_LABEL } from "@/components/dashboard/formatting";

type EvolutionChartProps = {
  /** Liste complète des analyses du dossier — alimente le mode annuel. */
  analyses: AnalysisRecord[];
  /** Analyse courante (active dans le cockpit) — alimente le mode mensuel. */
  currentAnalysis: AnalysisRecord | null;
};

// Couleurs des séries — référencent les CSS vars qui flip selon le theme.
// COLOR_CA pointe vers `--app-text-primary` : blanc en dark, noir en light.
// COLOR_EBE pointe vers `--app-brand-gold` : flip aussi.
const COLOR_CA = "var(--app-text-primary)";
const COLOR_EBE = "var(--app-brand-gold)";
const COLOR_RESULTAT = "#34D399";

const SERIES_LABELS = {
  ca: "Chiffre d'affaires",
  ebe: "EBE",
  resultatNet: "Résultat net"
} as const;

function EvolutionChartImpl({ analyses, currentAnalysis }: EvolutionChartProps) {
  const monthlyAvailable = hasMonthlyDataAvailable(currentAnalysis);
  // Theme-aware chart colors. En dark : ticks/labels blancs translucides.
  // En light : ticks/labels gris foncé + texte de légende noir (cf. brief
  // Synthèse : "légende des graphiques en noir").
  const { isDark } = useTheme();
  const tickColor = isDark ? "rgba(255,255,255,0.55)" : "rgba(10,10,15,0.65)";
  const tickColorMuted = isDark ? "rgba(255,255,255,0.45)" : "rgba(10,10,15,0.55)";
  const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const axisColor = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.12)";
  const legendColor = isDark ? "rgba(255,255,255,0.7)" : "rgba(10,10,15,0.95)";

  const [mode, setMode] = useState<EvolutionSeriesMode>(
    monthlyAvailable ? "monthly" : "yearly"
  );
  const [monthlyWindow, setMonthlyWindow] = useState<MonthlyWindow>(12);
  const [yearlyRange, setYearlyRange] = useState<YearlyRange>("5y");

  // Construction de la série en fonction du mode actif.
  // useMemo : les builders sont O(N) mais buildMonthlySeries appelle
  // recomputeKpisForPeriod à chaque mois (computeKpis × 12-24). Cache strict.
  const series = useMemo<EvolutionPoint[]>(() => {
    if (mode === "monthly" && currentAnalysis) {
      return buildMonthlySeries(currentAnalysis, monthlyWindow);
    }
    return filterYearlyByRange(buildYearlySeries(analyses), yearlyRange);
  }, [mode, monthlyWindow, yearlyRange, analyses, currentAnalysis]);

  const hasData = series.some(
    (p) => p.ca !== null || p.ebe !== null || p.resultatNet !== null
  );

  return (
    <article
      className="precision-card fade-up flex h-full flex-col rounded-2xl p-5"
      data-search-id="synthese-evolution-chart"
    >
      <header className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/45">
            Évolution
          </span>
          <h3 className="text-base font-semibold text-white">Performance financière</h3>
        </div>

        {monthlyAvailable ? <ModeToggle mode={mode} onChange={setMode} /> : null}
      </header>

      {/* Sélecteur de période contextuel au mode actif. Plus large qu'avant
          pour permettre un zoom court (3 mois) ou une lecture longue (10 ans
          / Tout l'historique) selon le besoin. */}
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
        <div className="h-[260px] flex-1 min-h-[220px]">
          <StableChartContainer>
            <LineChart data={series} margin={{ top: 10, right: 18, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: tickColor, fontSize: 10, fontFamily: "monospace" }}
                tickLine={false}
                axisLine={{ stroke: axisColor }}
              />
              <YAxis
                tick={{ fill: tickColorMuted, fontSize: 10, fontFamily: "monospace" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatYAxisValue}
                width={50}
              />
              <Tooltip
                content={(props) => <EvolutionTooltip {...props} />}
                cursor={{ stroke: "rgba(197,160,89,0.25)", strokeWidth: 1 }}
              />
              <Legend
                verticalAlign="bottom"
                iconType="line"
                wrapperStyle={{ fontSize: "10px", paddingTop: "8px" }}
                formatter={(value: string) => (
                  <span style={{ color: legendColor }}>{value}</span>
                )}
              />
              <Line
                type="monotone"
                dataKey="ca"
                name={SERIES_LABELS.ca}
                stroke={COLOR_CA}
                strokeWidth={2.4}
                dot={{ r: 2.5, fill: COLOR_CA, strokeWidth: 0 }}
                activeDot={{ r: 5, stroke: COLOR_CA, strokeWidth: 1, fill: "#0f0f12" }}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="ebe"
                name={SERIES_LABELS.ebe}
                stroke={COLOR_EBE}
                strokeWidth={2.2}
                dot={{ r: 2.5, fill: COLOR_EBE, strokeWidth: 0 }}
                activeDot={{ r: 5, stroke: COLOR_EBE, strokeWidth: 1, fill: "#0f0f12" }}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="resultatNet"
                name={SERIES_LABELS.resultatNet}
                stroke={COLOR_RESULTAT}
                strokeWidth={2}
                dot={{ r: 2.5, fill: COLOR_RESULTAT, strokeWidth: 0 }}
                activeDot={{ r: 5, stroke: COLOR_RESULTAT, strokeWidth: 1, fill: "#0f0f12" }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </StableChartContainer>
        </div>
      ) : (
        <EmptyState mode={mode} hasAnyAnalysis={analyses.length > 0} />
      )}
    </article>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Sous-composants UI
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

function EmptyState({ mode, hasAnyAnalysis }: { mode: EvolutionSeriesMode; hasAnyAnalysis: boolean }) {
  let message: string;
  if (mode === "monthly") {
    message =
      "Aucune écriture journalière disponible pour cette période. Connectez Pennylane / MyUnisoft / Odoo pour activer la lecture mensuelle.";
  } else if (!hasAnyAnalysis) {
    message = "Importez au moins une analyse pour visualiser l'évolution.";
  } else {
    message = "Pas assez de points historiques pour tracer la courbe.";
  }
  return (
    <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
      <p className="max-w-xs text-xs text-white/55">{message}</p>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Tooltip custom (cohérent avec la DA premium quantis)
// ───────────────────────────────────────────────────────────────────────

function EvolutionTooltip(props: TooltipContentProps) {
  const { active, payload, label } = props;
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="rounded-lg border border-white/15 bg-quantis-base/95 p-3 text-xs text-white/85 shadow-xl backdrop-blur">
      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-white/55">{label}</p>
      <ul className="space-y-1">
        {payload.map((p, idx) => (
          <li key={String(p.dataKey ?? p.name ?? idx)} className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: typeof p.color === "string" ? p.color : "#fff" }}
                aria-hidden="true"
              />
              <span className="text-white/70">{p.name}</span>
            </span>
            <span className="tnum font-medium text-white">
              {formatTooltipValue(typeof p.value === "number" ? p.value : null)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Formatting helpers
// ───────────────────────────────────────────────────────────────────────

// Compact pour l'axe Y : "1,2 M€" / "342 k€" / "8 500 €" / "—".
function formatYAxisValue(value: number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} M`;
  if (abs >= 1_000) return `${Math.round(value / 1_000)} k`;
  return String(Math.round(value));
}

function formatTooltipValue(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return INSUFFICIENT_DATA_LABEL;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  }).format(value);
}

// React.memo : prévient les re-renders pendant le drag (les seuls cas où
// les props pourraient changer sont des changements de données, pas des
// updates UI). Recharts a un useEffect interne sensible aux re-renders
// fréquents — sans memo, un drag déclenche "Maximum update depth exceeded"
// dans XAxis. Comparaison shallow par défaut suffit (analyses et
// currentAnalysis sont des références stables tant que les données ne
// changent pas).
export const EvolutionChart = memo(EvolutionChartImpl);
