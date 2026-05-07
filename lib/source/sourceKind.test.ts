// File: lib/source/sourceKind.test.ts
// Tests pour les utilitaires de classification d'analyse (kind + description).
// L'ancien `resolveActiveAnalysis` n'existe plus — la résolution de la
// source active passe désormais par `useActiveDataSource` (cf. tests
// dans hooks/useActiveDataSource.test.ts).

import { describe, expect, it } from "vitest";
import { describeAnalysisSource, getAnalysisSourceKind } from "@/lib/source/sourceKind";
import type { AnalysisRecord } from "@/types/analysis";

function makeAnalysis(overrides: Partial<AnalysisRecord>): AnalysisRecord {
  return {
    id: overrides.id ?? "x",
    userId: "u",
    folderName: "Dossier principal",
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    fiscalYear: 2025,
    sourceFiles: overrides.sourceFiles ?? [],
    parsedData: [],
    rawData: { byVariableCode: {}, byLineCode: {}, byLabel: {} },
    mappedData: {} as never,
    financialFacts: {} as never,
    kpis: {} as never,
    ...overrides,
  } as AnalysisRecord;
}

describe("getAnalysisSourceKind", () => {
  it("identifies Pennylane sync", () => {
    const a = makeAnalysis({
      sourceMetadata: { type: "dynamic", provider: "pennylane" } as never,
    });
    expect(getAnalysisSourceKind(a)).toBe("pennylane");
  });

  it("identifies FEC import (dynamic)", () => {
    const a = makeAnalysis({
      sourceMetadata: { type: "dynamic", provider: "fec" } as never,
    });
    expect(getAnalysisSourceKind(a)).toBe("fec");
  });

  it("identifies PDF upload via sourceFiles", () => {
    const a = makeAnalysis({
      sourceFiles: [{ name: "balance.pdf", mimeType: "application/pdf", size: 1, type: "pdf" }],
    });
    expect(getAnalysisSourceKind(a)).toBe("pdf");
  });
});

describe("describeAnalysisSource", () => {
  it("labels Pennylane with sync prefix", () => {
    const a = makeAnalysis({
      sourceMetadata: {
        type: "dynamic",
        provider: "pennylane",
        syncedAt: new Date().toISOString(),
      } as never,
    });
    const desc = describeAnalysisSource(a);
    expect(desc.kind).toBe("pennylane");
    expect(desc.label).toBe("Pennylane");
    expect(desc.detail).toMatch(/sync/);
  });

  it("labels PDF with filename", () => {
    const a = makeAnalysis({
      folderName: "soretole.pdf",
      sourceFiles: [{ name: "soretole.pdf", mimeType: "application/pdf", size: 1, type: "pdf" }],
    });
    const desc = describeAnalysisSource(a);
    expect(desc.kind).toBe("pdf");
    expect(desc.label).toContain("soretole.pdf");
  });
});
