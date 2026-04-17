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
  const targetYear =
    selectedYearValue === SYNTHESIS_CURRENT_YEAR_KEY ? currentYear : Number(selectedYearValue);

  if (!Number.isFinite(targetYear)) {
    return analyses;
  }

  return analyses.filter((analysis) => resolveAnalysisYear(analysis) === targetYear);
}
