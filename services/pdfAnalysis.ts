import { analyzeFinancialDocument as runFinancialAnalysis } from "@/services/pdf-analysis/analysisEngine";
import type {
  AnalysisResult,
  DetectedFinancialSections,
  DocumentAIResponse,
  FieldSelectionTrace,
  FinancialExtractionDiagnostics,
  ParsedFinancialData,
  ReconstructedRow
} from "@/services/pdf-analysis/types";
import { createEmptyParsedFinancialData as createEmptyData } from "@/services/pdf-analysis/types";

export type {
  AnalysisResult,
  DetectedFinancialSections,
  DocumentAIResponse,
  FieldSelectionTrace,
  FinancialExtractionDiagnostics,
  ParsedFinancialData,
  ReconstructedRow
};

export const createEmptyParsedFinancialData = createEmptyData;

export function analyzeFinancialDocument(document: DocumentAIResponse): AnalysisResult {
  return runFinancialAnalysis(document);
}

export function extractFinancialData(document: DocumentAIResponse): ParsedFinancialData {
  return runFinancialAnalysis(document).parsedFinancialData;
}

export function detectFinancialSections(document: DocumentAIResponse): DetectedFinancialSections {
  return runFinancialAnalysis(document).detectedSections;
}

export function computeFinancialExtractionDiagnostics(
  document: DocumentAIResponse,
  _financialData: ParsedFinancialData,
  _detectedSections: DetectedFinancialSections
): FinancialExtractionDiagnostics {
  return runFinancialAnalysis(document).diagnostics;
}
