import { describe, expect, it } from "vitest";
import { computeAvailableRange, shouldShowTemporalityBar } from "@/lib/temporality/availableRange";
import type { AnalysisRecord } from "@/types/analysis";

function makeAnalysis(daily: Array<{ date: string }>): AnalysisRecord {
  return {
    id: "a",
    userId: "u",
    folderName: "Documents",
    createdAt: "2026-01-01T00:00:00.000Z",
    fiscalYear: 2026,
    sourceFiles: [],
    parsedData: [],
    rawData: { byVariableCode: {}, byLineCode: {}, byLabel: {} },
    mappedData: {} as never,
    financialFacts: {} as never,
    kpis: {} as never,
    dailyAccounting: daily as never,
  } as AnalysisRecord;
}

describe("computeAvailableRange", () => {
  it("returns min/max date from dailyAccounting (unsorted input)", () => {
    const a = makeAnalysis([{ date: "2026-04-15" }, { date: "2025-01-03" }, { date: "2026-01-31" }]);
    expect(computeAvailableRange(a)).toEqual({ minDate: "2025-01-03", maxDate: "2026-04-15" });
  });

  it("handles a single-day analysis", () => {
    const a = makeAnalysis([{ date: "2026-02-29" }]);
    expect(computeAvailableRange(a)).toEqual({ minDate: "2026-02-29", maxDate: "2026-02-29" });
  });

  it("returns null for empty dailyAccounting (static source)", () => {
    expect(computeAvailableRange(makeAnalysis([]))).toBeNull();
  });
});

describe("shouldShowTemporalityBar", () => {
  it("hides for null analysis", () => {
    expect(shouldShowTemporalityBar(null)).toBe(false);
  });

  it("hides for static source (no dailyAccounting)", () => {
    expect(shouldShowTemporalityBar(makeAnalysis([]))).toBe(false);
  });

  it("shows for dynamic source with at least one daily entry", () => {
    expect(shouldShowTemporalityBar(makeAnalysis([{ date: "2026-04-29" }]))).toBe(true);
  });
});
