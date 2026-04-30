import { describe, expect, it } from "vitest";
import {
  describeAnalysisSource,
  getAnalysisSourceKind,
  resolveActiveAnalysis,
} from "@/lib/source/activeSource";
import type { AnalysisRecord } from "@/types/analysis";

function makeAnalysis(overrides: Partial<AnalysisRecord>): AnalysisRecord {
  return {
    id: overrides.id ?? "x",
    userId: "u",
    folderName: "Documents",
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

describe("resolveActiveAnalysis", () => {
  const pennylane = makeAnalysis({
    id: "p",
    createdAt: "2026-01-01T00:00:00.000Z",
    sourceMetadata: { type: "dynamic", provider: "pennylane" } as never,
  });
  const fec = makeAnalysis({
    id: "f",
    createdAt: "2026-04-01T00:00:00.000Z",
    sourceMetadata: { type: "dynamic", provider: "fec" } as never,
  });
  const pdf = makeAnalysis({
    id: "d",
    createdAt: "2026-04-15T00:00:00.000Z",
    sourceFiles: [{ name: "x.pdf", mimeType: "application/pdf", size: 1, type: "pdf" }],
  });

  it("respects explicit ID when present", () => {
    const result = resolveActiveAnalysis([pdf, pennylane, fec], "f");
    expect(result?.id).toBe("f");
  });

  it("falls back to priority when explicit ID is unknown", () => {
    // Pennylane > FEC > PDF, donc Pennylane gagne même s'il est le moins récent.
    const result = resolveActiveAnalysis([pdf, fec, pennylane], "missing-id");
    expect(result?.id).toBe("p");
  });

  it("most recent wins at equal priority", () => {
    const oldPdf = makeAnalysis({
      id: "old",
      createdAt: "2025-01-01T00:00:00.000Z",
      sourceFiles: [{ name: "old.pdf", mimeType: "application/pdf", size: 1, type: "pdf" }],
    });
    const result = resolveActiveAnalysis([oldPdf, pdf], null);
    expect(result?.id).toBe("d"); // = "d" plus récent
  });

  it("returns null when list is empty", () => {
    expect(resolveActiveAnalysis([], "any")).toBeNull();
  });
});

describe("describeAnalysisSource", () => {
  it("labels Pennylane with sync prefix", () => {
    const a = makeAnalysis({
      sourceMetadata: { type: "dynamic", provider: "pennylane", syncedAt: new Date().toISOString() } as never,
    });
    const desc = describeAnalysisSource(a);
    expect(desc.kind).toBe("pennylane");
    expect(desc.label).toBe("Pennylane");
    expect(desc.detail).toMatch(/sync/);
  });

  it("labels PDF with filename", () => {
    const a = makeAnalysis({
      sourceFiles: [{ name: "soretole.pdf", mimeType: "application/pdf", size: 1, type: "pdf" }],
    });
    const desc = describeAnalysisSource(a);
    expect(desc.kind).toBe("pdf");
    expect(desc.label).toContain("soretole.pdf");
  });
});
