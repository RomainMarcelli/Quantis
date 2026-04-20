import { analyzeDocument2050 } from "@/services/pdf-analysis/analysisEngine2050";
import { analyzeDocumentFusalp } from "@/services/pdf-analysis/analysisEngineFusalp";
import { analyzeDocumentRegnology } from "@/services/pdf-analysis/analysisEngineRegnology";
import { analyzeDocumentSage } from "@/services/pdf-analysis/analysisEngineSage";
import { buildDiagnostics } from "@/services/pdf-analysis/diagnostics";
import { resolveFieldValues } from "@/services/pdf-analysis/fieldResolver";
import { detectDocumentFormat } from "@/services/pdf-analysis/formatDetector";
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
  const format = detectDocumentFormat(document.rawText ?? "");
  if (format === "dgfip-2050") {
    return analyzeDocument2050(document);
  }
  if (format === "sage") {
    return analyzeDocumentSage(document);
  }
  if (format === "regnology") {
    return analyzeDocumentRegnology(document);
  }
  if (format === "fiducial") {
    return analyzeDocumentFusalp(document);
  }

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
  return process.env.PARSER_DEBUG === "true";
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
