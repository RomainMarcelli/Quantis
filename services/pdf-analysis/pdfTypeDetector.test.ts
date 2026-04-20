import { describe, expect, it } from "vitest";
import { detectPdfType } from "./pdfTypeDetector";
import type { DocumentAIExtractionResult } from "@/services/documentAI";

function makeExtraction(overrides: {
  rawTextLength: number;
  tablesCount: number;
  entitiesCount: number;
}): DocumentAIExtractionResult {
  return {
    rawText: "x".repeat(overrides.rawTextLength),
    pages: [],
    entities: Array.from({ length: overrides.entitiesCount }, () => ({})),
    tables: Array.from({ length: overrides.tablesCount }, () => ({}))
  };
}

const defaultPageInfo = { originalPages: 10, isScanned: false };

describe("detectPdfType", () => {
  it("détecte native_text quand tableaux présents", () => {
    const result = detectPdfType(
      makeExtraction({ rawTextLength: 15000, tablesCount: 5, entitiesCount: 0 }),
      defaultPageInfo
    );
    expect(result.type).toBe("native_text");
    expect(result.confidence).toBe(0.90);
  });

  it("détecte scanned_text quand texte mais pas de tableaux", () => {
    const result = detectPdfType(
      makeExtraction({ rawTextLength: 18000, tablesCount: 0, entitiesCount: 0 }),
      defaultPageInfo
    );
    expect(result.type).toBe("scanned_text");
    expect(result.confidence).toBe(0.80);
  });

  it("détecte image_only quand quasi aucun texte", () => {
    const result = detectPdfType(
      makeExtraction({ rawTextLength: 200, tablesCount: 0, entitiesCount: 0 }),
      defaultPageInfo
    );
    expect(result.type).toBe("image_only");
    expect(result.confidence).toBe(0.95);
  });

  it("détecte native_text quand entités présentes sans tableaux", () => {
    const result = detectPdfType(
      makeExtraction({ rawTextLength: 5000, tablesCount: 0, entitiesCount: 3 }),
      defaultPageInfo
    );
    expect(result.type).toBe("native_text");
  });

  it("retourne les métriques correctes", () => {
    const result = detectPdfType(
      makeExtraction({ rawTextLength: 12000, tablesCount: 2, entitiesCount: 1 }),
      { originalPages: 25, isScanned: false }
    );
    expect(result.rawTextLength).toBe(12000);
    expect(result.tablesCount).toBe(2);
    expect(result.entitiesCount).toBe(1);
    expect(result.pagesCount).toBe(25);
  });
});
