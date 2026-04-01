// File: lib/synthese/synthesePeriod.test.ts
// Role: valide le filtrage des analyses par année et la génération des options de période UI.
import { describe, expect, it } from "vitest";
import type {
  AnalysisRecord,
  CalculatedKpis,
  FinancialFacts,
  MappedFinancialData,
  ParsedFileData,
  RawAnalysisData
} from "@/types/analysis";
import {
  buildSyntheseYearOptions,
  filterAnalysesByYear,
  resolveAnalysisYear,
  SYNTHESIS_CURRENT_YEAR_KEY
} from "@/lib/synthese/synthesePeriod";

function makeAnalysis(id: string, createdAt: string, fiscalYear: number | null): AnalysisRecord {
  return {
    id,
    userId: "u1",
    folderName: "Dossier principal",
    createdAt,
    fiscalYear,
    sourceFiles: [],
    parsedData: [] as ParsedFileData[],
    rawData: {} as RawAnalysisData,
    mappedData: {} as MappedFinancialData,
    financialFacts: {} as FinancialFacts,
    kpis: {} as CalculatedKpis,
    quantisScore: null,
    uploadContext: null
  };
}

describe("resolveAnalysisYear", () => {
  it("priorise fiscalYear quand il est disponible", () => {
    const analysis = makeAnalysis("a1", "2026-01-10T00:00:00.000Z", 2025);
    expect(resolveAnalysisYear(analysis)).toBe(2025);
  });

  it("utilise createdAt si fiscalYear est absent", () => {
    const analysis = makeAnalysis("a1", "2026-01-10T00:00:00.000Z", null);
    expect(resolveAnalysisYear(analysis)).toBe(2026);
  });
});

describe("buildSyntheseYearOptions", () => {
  it("inclut Année en cours (YYYY) et les années historiques basées sur fiscalYear", () => {
    const analyses = [
      makeAnalysis("a1", "2026-01-10T00:00:00.000Z", null),
      makeAnalysis("a2", "2025-02-10T00:00:00.000Z", null),
      makeAnalysis("a3", "2024-03-10T00:00:00.000Z", 2033)
    ];

    const options = buildSyntheseYearOptions(analyses, 2026);
    expect(options[0]).toEqual({ value: SYNTHESIS_CURRENT_YEAR_KEY, label: "Année en cours (2026)" });
    expect(options.some((option) => option.value === "2025")).toBe(true);
    expect(options.some((option) => option.value === "2033")).toBe(true);
  });
});

describe("filterAnalysesByYear", () => {
  it("filtre sur Année en cours", () => {
    const analyses = [
      makeAnalysis("a1", "2026-01-10T00:00:00.000Z", null),
      makeAnalysis("a2", "2025-01-10T00:00:00.000Z", null)
    ];

    const filtered = filterAnalysesByYear(analyses, SYNTHESIS_CURRENT_YEAR_KEY, 2026);
    expect(filtered.map((analysis) => analysis.id)).toEqual(["a1"]);
  });

  it("filtre sur une année explicite", () => {
    const analyses = [
      makeAnalysis("a1", "2026-01-10T00:00:00.000Z", null),
      makeAnalysis("a2", "2025-01-10T00:00:00.000Z", null)
    ];

    const filtered = filterAnalysesByYear(analyses, "2025", 2026);
    expect(filtered.map((analysis) => analysis.id)).toEqual(["a2"]);
  });
});
