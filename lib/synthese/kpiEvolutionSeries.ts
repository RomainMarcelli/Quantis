// File: lib/synthese/kpiEvolutionSeries.ts
// Role: builders de séries temporelles génériques pour n'importe quel KPI du
// registre, alimentent le graphique top des 4 onglets dashboard.
//
// Différence avec evolutionSeries.ts (qui construit une série multi-KPI fixe :
// CA + EBE + Résultat net) : ici la série suit UN seul KPI sélectionné par
// l'utilisateur via clic sur une carte.

import type { AnalysisRecord, CalculatedKpis } from "@/types/analysis";
import { recomputeKpisForPeriod } from "@/lib/temporality/recomputeKpisForPeriod";
import { resolveAnalysisFiscalYear, sortAnalysesByFiscalYear } from "@/services/analysisHistory";
import {
  hasMonthlyDataAvailable,
  listAvailableMonths
} from "@/lib/synthese/evolutionSeries";

export type KpiEvolutionPoint = {
  key: string;
  label: string;
  value: number | null;
};

// Lit la valeur d'un KPI sur un objet CalculatedKpis. Retourne null si la clé
// n'existe pas (KPI hors registre comptable, ex. banking) — l'UI affichera
// une absence de courbe plutôt que zéro qui serait trompeur.
function readKpiValue(kpis: CalculatedKpis | null | undefined, kpiId: string): number | null {
  if (!kpis) return null;
  const value = (kpis as unknown as Record<string, number | null | undefined>)[kpiId];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// ─── Mode annuel — DYNAMIQUE (agrégation depuis dailyAccounting) ──────────
// Quand l'analyse courante est dynamique, on agrège ses KPIs par année à
// partir du dailyAccounting (Jan-Dec par exercice civil) plutôt que de
// fallback sur l'historique d'analyses (qui mélange dynamique et statique
// → incohérence visuelle entre mode mensuel et mode annuel).

export function buildKpiYearlyFromDaily(
  analysis: AnalysisRecord,
  kpiId: string,
): KpiEvolutionPoint[] {
  const daily = analysis.dailyAccounting;
  if (!daily || daily.length === 0) return [];

  const years = new Set<number>();
  for (const entry of daily) {
    const d = new Date(entry.date);
    if (!Number.isNaN(d.getTime())) years.add(d.getFullYear());
  }
  const sortedYears = Array.from(years).sort((a, b) => a - b);

  return sortedYears.map((year) => {
    const result = recomputeKpisForPeriod(analysis, `${year}-01-01`, `${year}-12-31`);
    return {
      key: String(year),
      label: String(year),
      value: readKpiValue(result.kpis, kpiId),
    };
  });
}

// ─── Mode annuel — STATIQUE (historique d'analyses) ──────────────────────

export function buildKpiYearlySeries(
  analyses: AnalysisRecord[],
  kpiId: string
): KpiEvolutionPoint[] {
  if (!analyses.length) return [];

  const sorted = sortAnalysesByFiscalYear(analyses, "asc");
  const byYear = new Map<number, AnalysisRecord>();
  for (const analysis of sorted) {
    const year = resolveAnalysisFiscalYear(analysis);
    if (year === null) continue;
    byYear.set(year, analysis);
  }

  const years = Array.from(byYear.keys()).sort((a, b) => a - b);
  return years.map((year) => {
    const analysis = byYear.get(year)!;
    return {
      key: String(year),
      label: String(year),
      value: readKpiValue(analysis.kpis, kpiId)
    };
  });
}

// ─── Mode mensuel ────────────────────────────────────────────────────────

const MONTH_LABELS_FR = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
  "Juil", "Août", "Sep", "Oct", "Nov", "Déc"
];

function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(year, month, 0);
  return `${year}-${String(month).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatMonthLabel(ym: string): string {
  const [year, month] = ym.split("-").map(Number);
  return `${MONTH_LABELS_FR[month - 1]} ${String(year).slice(-2)}`;
}

export function buildKpiMonthlySeries(
  analysis: AnalysisRecord,
  kpiId: string,
  monthsBack: number | "all" = 12
): KpiEvolutionPoint[] {
  if (!hasMonthlyDataAvailable(analysis)) return [];

  const months = listAvailableMonths(analysis);
  if (!months.length) return [];

  const window =
    monthsBack === "all" || !Number.isFinite(monthsBack)
      ? months
      : months.slice(-(monthsBack as number));

  return window.map((ym) => {
    const [year, month] = ym.split("-").map(Number);
    const periodStart = `${ym}-01`;
    const periodEnd = lastDayOfMonth(year, month);
    const result = recomputeKpisForPeriod(analysis, periodStart, periodEnd);
    return {
      key: ym,
      label: formatMonthLabel(ym),
      value: readKpiValue(result.kpis, kpiId)
    };
  });
}
