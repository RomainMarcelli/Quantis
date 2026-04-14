import { buildDiagnostics } from "@/services/pdf-analysis/diagnostics";
import { resolveFieldValues } from "@/services/pdf-analysis/fieldResolver";
import {
  buildReconstructedRows,
  detectCdrLayout,
  detectSectionsFromRows
} from "@/services/pdf-analysis/rowReconstruction";
import type {
  AnalysisResult,
  DetectedFinancialSections,
  DocumentAIResponse,
  FinancialExtractionDiagnostics,
  FieldSelectionTrace,
  ParsedFinancialData,
  ReconstructedRow
} from "@/services/pdf-analysis/types";
import { mapFieldValuesToParsedData } from "@/services/pdf-analysis/valueMapping";

export function analyzeFinancialDocument(document: DocumentAIResponse): AnalysisResult {
  const rows = buildReconstructedRows(document);
  const detectedSections = detectSectionsFromRows(rows);
  const cdrLayout = detectCdrLayout(rows);
  const { values, traces } = resolveFieldValues(rows, cdrLayout, document.rawText);
  const parsedFinancialData = mapFieldValuesToParsedData(values);
  const diagnostics = buildDiagnostics({
    parsedFinancialData,
    traces
  });

  if (isDebugEnabled()) {
    logDebugSnapshot({ rows, traces, diagnostics, detectedSections });
  }

  return {
    parsedFinancialData,
    detectedSections,
    diagnostics,
    traces,
    rows
  };
}

function logDebugSnapshot(input: {
  rows: ReconstructedRow[];
  traces: FieldSelectionTrace[];
  diagnostics: FinancialExtractionDiagnostics;
  detectedSections: DetectedFinancialSections;
}) {
  const { rows, traces, diagnostics, detectedSections } = input;

  console.info("[pdf-analysis] Sections detected", detectedSections);
  console.info(
    "[pdf-analysis] Reconstructed rows sample",
    rows.slice(0, 20).map((row) => ({
      source: row.source,
      page: row.page,
      rowNumber: row.rowNumber,
      section: row.section,
      label: row.label,
      lineCode: row.lineCode,
      amountCandidates: row.amountCandidates.map((candidate) => ({
        value: candidate.value,
        columnIndex: candidate.columnIndex,
        headerHint: candidate.headerHint
      }))
    }))
  );

  console.info(
    "[pdf-analysis] Field traces",
    traces.map((trace) => ({
      field: trace.field,
      selected: trace.selected,
      alternatives: trace.alternatives
    }))
  );

  console.info("[pdf-analysis] Diagnostics", diagnostics);
}

function isDebugEnabled(): boolean {
  return process.env.PDF_PARSER_DEBUG === "true";
}

export function toLegacyOutputs(result: AnalysisResult): {
  financialData: ParsedFinancialData;
  sections: DetectedFinancialSections;
  diagnostics: FinancialExtractionDiagnostics;
} {
  return {
    financialData: result.parsedFinancialData,
    sections: result.detectedSections,
    diagnostics: result.diagnostics
  };
}
