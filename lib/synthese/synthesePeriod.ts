// File: lib/synthese/synthesePeriod.ts
// Role: gère les options d'année de synthèse et le filtrage des analyses par période.
import type { AnalysisRecord } from "@/types/analysis";

export const SYNTHESIS_CURRENT_YEAR_KEY = "current";

export type SyntheseYearOption = {
  value: string;
  label: string;
};

// Extrait l'année d'une analyse en priorisant la date d'ajout (createdAt).
// Le fallback fiscalYear reste uniquement défensif si la date est invalide.
export function resolveAnalysisYear(analysis: AnalysisRecord): number {
  const createdAtYear = new Date(analysis.createdAt).getFullYear();
  if (Number.isFinite(createdAtYear)) {
    return createdAtYear;
  }

  if (analysis.fiscalYear !== null) {
    return analysis.fiscalYear;
  }

  return new Date().getFullYear();
}

// Construit la liste des périodes: "Année en cours" + années disponibles en historique.
export function buildSyntheseYearOptions(
  analyses: AnalysisRecord[],
  currentYear: number
): SyntheseYearOption[] {
  const availableYears = Array.from(
    new Set(analyses.map((analysis) => resolveAnalysisYear(analysis)))
  ).sort((left, right) => right - left);

  const options: SyntheseYearOption[] = [
    { value: SYNTHESIS_CURRENT_YEAR_KEY, label: `Année en cours (${currentYear})` }
  ];

  availableYears.forEach((year) => {
    options.push({
      value: String(year),
      label: String(year)
    });
  });

  // Évite d'avoir deux fois l'année courante (label dédié + année brute).
  return options.filter(
    (option, index, list) =>
      list.findIndex((entry) => entry.value === option.value) === index &&
      !(option.value === String(currentYear) && options[0]?.value === SYNTHESIS_CURRENT_YEAR_KEY)
  );
}

// Filtre les analyses selon l'année choisie dans la synthèse.
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
