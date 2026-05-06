// File: lib/synthese/synthesePeriod.ts
// Role: gère les options d'année de synthèse et le filtrage des analyses par période.
import { resolveAnalysisFiscalYear } from "@/services/analysisHistory";
import type { AnalysisRecord } from "@/types/analysis";

export const SYNTHESIS_CURRENT_YEAR_KEY = "current";

export type SyntheseYearOption = {
  value: string;
  label: string;
};

export function resolveAnalysisYear(analysis: AnalysisRecord): number {
  const fiscalYear = resolveAnalysisFiscalYear(analysis);
  if (fiscalYear !== null) {
    return fiscalYear;
  }

  const createdYear = new Date(analysis.createdAt).getFullYear();
  return Number.isFinite(createdYear) ? createdYear : new Date().getFullYear();
}

export function buildSyntheseYearOptions(
  analyses: AnalysisRecord[],
  _currentYear: number
): SyntheseYearOption[] {
  const availableYears = Array.from(
    new Set(analyses.map((analysis) => resolveAnalysisYear(analysis)))
  ).sort((left, right) => right - left);

  if (availableYears.length === 0) {
    return [];
  }

  return availableYears.map((year) => ({
    value: String(year),
    label: String(year)
  }));
}

export function filterAnalysesByYear(
  analyses: AnalysisRecord[],
  selectedYearValue: string,
  currentYear: number
): AnalysisRecord[] {
  // Garde-fou : `selectedYearValue` vide (= état initial avant que l'effet
  // d'auto-sélection ne tire) → on retourne toutes les analyses. Sans ça
  // `Number("")` vaut `0` (pas NaN), Number.isFinite(0) === true, et le
  // filtre cherche les analyses de l'année 0 → tableau vide → la Synthèse
  // retombe sur le fallback "Aucune synthèse disponible" pendant la
  // fraction de seconde avant que le useEffect ne remplisse selectedYearValue.
  const trimmed = selectedYearValue.trim();
  if (!trimmed) {
    return analyses;
  }

  const targetYear =
    trimmed === SYNTHESIS_CURRENT_YEAR_KEY ? currentYear : Number(trimmed);

  if (!Number.isFinite(targetYear)) {
    return analyses;
  }

  return analyses.filter((analysis) => resolveAnalysisYear(analysis) === targetYear);
}
