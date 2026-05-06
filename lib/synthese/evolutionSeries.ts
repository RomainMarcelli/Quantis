// File: lib/synthese/evolutionSeries.ts
// Role: builders de séries temporelles pour le graphique d'évolution synthese.
//
// Deux modes :
// - Annuel (statique) : un point par exercice, lit directement analysis.kpis
//   pour l'historique complet du dossier. Source = uploads PDF + syncs annuels.
// - Mensuel (dynamique) : un point par mois, recalcule via recomputeKpisForPeriod
//   depuis dailyAccounting. Disponible uniquement si l'analyse courante a des
//   écritures journalières (Pennylane / MyUnisoft / Odoo connectés).
//
// Les deux modes partagent le shape de sortie EvolutionPoint pour que le
// composant chart soit agnostique du mode courant.

import type { AnalysisRecord } from "@/types/analysis";
import { recomputeKpisForPeriod } from "@/lib/temporality/recomputeKpisForPeriod";
import { resolveAnalysisFiscalYear, sortAnalysesByFiscalYear } from "@/services/analysisHistory";

export type EvolutionPoint = {
  // Clé d'axe x : "2024" pour annuel, "2024-03" pour mensuel.
  key: string;
  // Libellé court à afficher sur l'axe.
  label: string;
  ca: number | null;
  ebe: number | null;
  resultatNet: number | null;
};

export type EvolutionSeriesMode = "yearly" | "monthly";

// ───────────────────────────────────────────────────────────────────────
// Mode annuel (statique)
// ───────────────────────────────────────────────────────────────────────

export function buildYearlySeries(analyses: AnalysisRecord[]): EvolutionPoint[] {
  if (!analyses.length) return [];

  const sorted = sortAnalysesByFiscalYear(analyses, "asc");
  // Dédoublonne par exercice : si plusieurs analyses pour le même exercice,
  // on garde la plus récente (premier itéré post-tri par createdAt asc).
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
      ca: analysis.kpis?.ca ?? null,
      ebe: analysis.kpis?.ebe ?? null,
      resultatNet: analysis.kpis?.resultat_net ?? null
    };
  });
}

export type YearlyRange = "3y" | "5y" | "10y" | "all";

export function filterYearlyByRange(
  points: EvolutionPoint[],
  range: YearlyRange
): EvolutionPoint[] {
  if (range === "all") return points;
  const limit = range === "3y" ? 3 : range === "5y" ? 5 : 10;
  if (points.length <= limit) return points;
  return points.slice(-limit);
}

// ───────────────────────────────────────────────────────────────────────
// Mode mensuel (dynamique, dailyAccounting)
// ───────────────────────────────────────────────────────────────────────

export function hasMonthlyDataAvailable(analysis: AnalysisRecord | null | undefined): boolean {
  if (!analysis?.dailyAccounting) return false;
  // Seuil : ≥ 30 jours d'écritures journalières = au moins un mois exploitable.
  // En dessous, le découpage mensuel renvoie des points partiels qui faussent
  // visuellement la courbe (un mois à 2j d'activité affiche un mini-CA).
  return analysis.dailyAccounting.length >= 30;
}

// Retourne les bornes [start, end] de l'historique journalier disponible.
export function getMonthlyDataRange(
  analysis: AnalysisRecord
): { startDate: string; endDate: string } | null {
  const daily = analysis.dailyAccounting;
  if (!daily || daily.length === 0) return null;

  const dates = daily.map((entry) => entry.date).sort();
  return {
    startDate: dates[0],
    endDate: dates[dates.length - 1]
  };
}

// Liste les mois (YYYY-MM) couverts par les données journalières disponibles.
export function listAvailableMonths(analysis: AnalysisRecord): string[] {
  const range = getMonthlyDataRange(analysis);
  if (!range) return [];

  const months = new Set<string>();
  const start = new Date(range.startDate);
  const end = new Date(range.endDate);

  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end) {
    const ym = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    months.add(ym);
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return Array.from(months).sort();
}

export type MonthlyWindow = 3 | 6 | 12 | 24 | "all";

// Construit la série mensuelle pour les `monthsBack` derniers mois disponibles
// dans l'analyse courante (12 par défaut). Chaque point = recomputeKpisForPeriod
// sur la fenêtre [premier jour du mois, dernier jour du mois].
// `monthsBack === "all"` ou `Infinity` → on prend la totalité de l'historique.
export function buildMonthlySeries(
  analysis: AnalysisRecord,
  monthsBack: number | "all" = 12
): EvolutionPoint[] {
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
      ca: result.kpis.ca ?? null,
      ebe: result.kpis.ebe ?? null,
      resultatNet: result.kpis.resultat_net ?? null
    };
  });
}

// ───────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────

function lastDayOfMonth(year: number, month: number): string {
  // month en 1-12 ; on prend day=0 du mois suivant = dernier jour du mois courant.
  const d = new Date(year, month, 0);
  return `${year}-${String(month).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const MONTH_LABELS_FR = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
  "Juil", "Août", "Sep", "Oct", "Nov", "Déc"
];

function formatMonthLabel(ym: string): string {
  const [year, month] = ym.split("-").map(Number);
  return `${MONTH_LABELS_FR[month - 1]} ${String(year).slice(-2)}`;
}
