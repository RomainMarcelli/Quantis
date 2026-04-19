import type { DocumentAIExtractionResult } from "@/services/documentAI";

export type PdfType = "native_text" | "scanned_text" | "image_only";

export interface PdfTypeResult {
  type: PdfType;
  confidence: number;
  rawTextLength: number;
  tablesCount: number;
  entitiesCount: number;
  pagesCount: number;
}

export function detectPdfType(
  extraction: DocumentAIExtractionResult,
  pageExtractionInfo: { originalPages: number; isScanned: boolean }
): PdfTypeResult {
  const rawTextLength = extraction.rawText.length;
  const tablesCount = extraction.tables.length;
  const entitiesCount = extraction.entities.length;
  const pagesCount = pageExtractionInfo.originalPages;

  if (rawTextLength < 500) {
    return {
      type: "image_only",
      confidence: 0.95,
      rawTextLength, tablesCount, entitiesCount, pagesCount
    };
  }

  if (tablesCount > 0 || entitiesCount > 0) {
    return {
      type: "native_text",
      confidence: 0.90,
      rawTextLength, tablesCount, entitiesCount, pagesCount
    };
  }

  return {
    type: "scanned_text",
    confidence: 0.80,
    rawTextLength, tablesCount, entitiesCount, pagesCount
  };
}
