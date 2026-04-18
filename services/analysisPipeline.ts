import { computeKpis } from "@/services/kpiEngine";
import { calculateQuantisScore } from "@/lib/quantisScore";
import {
  applyLegacyFinancialFactsToMappedData,
  mapMappedDataToFinancialFacts,
  mapRawDataToMappedFinancialData,
  mergeRawAnalysisData
} from "@/services/mapping/financialDataMapper";
import { parseUploadedFile, type UploadedBinaryFile } from "@/services/parsers/fileParser";
import { mergeFinancialFacts } from "@/services/parsers/financialFactsExtractor";
import type { AnalysisDraft, FinancialFacts, MappedFinancialData, ParsedFileData } from "@/types/analysis";
import { extractFinancialPages } from "@/services/pdf-analysis/pdfPageExtractor";
import { processPdfWithDocumentAI } from "@/services/documentAI";
import { analyzeFinancialDocument } from "@/services/pdfAnalysis";
import { mapParsedFinancialDataToMappedFinancialData } from "@/services/mapping/parsedFinancialDataBridge";
import { extractWithVision, mergeVisionWithDocumentAI, buildExistingDataForVision } from "@/services/pdf-analysis/visionExtractor";
import { logVisionCall } from "@/services/pdf-analysis/visionLogger";

export async function runAnalysisPipeline(params: {
  userId: string;
  folderName: string;
  files: UploadedBinaryFile[];
  uploadContext?: {
    companySize?: string | null;
    sector?: string | null;
    source?: "dashboard" | "analysis" | "upload" | "manual";
  };
}): Promise<AnalysisDraft> {
  const pdfFiles = params.files.filter((f) => f.type === "pdf");
  const nonPdfFiles = params.files.filter((f) => f.type !== "pdf");

  // --- PDF : pipeline Document AI complet (11 fixes parser) ---
  let documentAiMappedData: MappedFinancialData | null = null;
  let documentAiParsedFileData: ParsedFileData | null = null;

  if (pdfFiles.length > 0) {
    const pdfFile = pdfFiles[0]!;
    try {
      const pageExtraction = await extractFinancialPages(Buffer.from(pdfFile.buffer));
      const extraction = await processPdfWithDocumentAI({
        pdfBuffer: pageExtraction.buffer,
        fileName: pdfFile.name,
        mimeType: pdfFile.mimeType,
        imagelessMode: pageExtraction.imagelessMode
      });
      const analysis = analyzeFinancialDocument(extraction);

      if (process.env.ANTHROPIC_API_KEY && analysis.diagnostics.confidenceScore < 0.80) {
        console.log(`[analysis-pipeline] Vision LLM fallback déclenché — score: ${analysis.diagnostics.confidenceScore}`);
        const visionStart = Date.now();
        try {
          const existingData = buildExistingDataForVision(analysis.parsedFinancialData);
          const visionResult = await extractWithVision(pageExtraction.buffer, pdfFile.name, existingData);
          if (visionResult.success && visionResult.data) {
            mergeVisionWithDocumentAI(analysis.parsedFinancialData, visionResult.data, analysis.diagnostics.fieldScores);
            const entry = {
              timestamp: new Date().toISOString(),
              analysisId: "pipeline",
              pdfName: pdfFile.name,
              triggered: true as const,
              confidenceScoreBefore: analysis.diagnostics.confidenceScore,
              confidenceScoreAfter: visionResult.confidenceScore,
              pagesAnalyzed: visionResult.pagesAnalyzed,
              model: "claude-haiku-4-5-20251001",
              fieldsFilledByVision: Object.keys(visionResult.data).filter((k) => (visionResult.data as Record<string, unknown>)[k] !== null),
              durationMs: Date.now() - visionStart
            };
            logVisionCall(entry);
            console.log("[VisionLogger] Entry logged:", entry.pdfName, "— fields:", entry.fieldsFilledByVision?.length);
          }
        } catch (visionError) {
          const errMsg = visionError instanceof Error ? visionError.message : "Unknown error";
          console.warn("[analysis-pipeline] Vision LLM fallback failed", errMsg);
          const errEntry = {
            timestamp: new Date().toISOString(),
            analysisId: "pipeline",
            pdfName: pdfFile.name,
            triggered: true as const,
            confidenceScoreBefore: analysis.diagnostics.confidenceScore,
            error: errMsg,
            durationMs: Date.now() - visionStart
          };
          logVisionCall(errEntry);
          console.log("[VisionLogger] Error entry logged:", errEntry.pdfName);
        }
      } else {
        const skipEntry = {
          timestamp: new Date().toISOString(),
          analysisId: "pipeline",
          pdfName: pdfFile.name,
          triggered: false as const,
          confidenceScoreBefore: analysis.diagnostics.confidenceScore
        };
        logVisionCall(skipEntry);
        console.log("[VisionLogger] Skip entry logged:", skipEntry.pdfName, "— score:", skipEntry.confidenceScoreBefore);
      }

      documentAiMappedData = mapParsedFinancialDataToMappedFinancialData(
        analysis.parsedFinancialData
      );
      documentAiParsedFileData = {
        fileName: pdfFile.name,
        fileType: "pdf",
        extractedAt: new Date().toISOString(),
        fiscalYear: inferFiscalYearFromText(extraction.rawText),
        metrics: [],
        previewRows: [
          {
            pages: pageExtraction.extractedPages,
            textSample: (extraction.rawText ?? "").slice(0, 220),
            revenue: null,
            expenses: null,
            treasury: null
          }
        ],
        rawData: { byVariableCode: {}, byLineCode: {}, byLabel: {} }
      };
      console.info("[analysis-pipeline] Document AI pipeline OK", {
        fileName: pdfFile.name,
        extractedPages: pageExtraction.extractedPages
      });
    } catch (error) {
      console.warn("[analysis-pipeline] Document AI pipeline failed, falling back to basic parser", {
        fileName: pdfFile.name,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  // --- Fichiers sans pipeline Document AI (Excel + PDF fallback) ---
  const fallbackFiles = documentAiParsedFileData
    ? nonPdfFiles
    : params.files;
  const fallbackParsedData = await Promise.all(
    fallbackFiles.map((file) => parseUploadedFile(file))
  );

  const parsedData: ParsedFileData[] = [
    ...(documentAiParsedFileData ? [documentAiParsedFileData] : []),
    ...fallbackParsedData
  ];

  const rawData = mergeRawAnalysisData(parsedData.map((item) => item.rawData));
  const legacyFacts = mergeFinancialFacts(parsedData.map((item) => mapParsedDataToFacts(item)));

  const mappedData = documentAiMappedData
    ?? applyLegacyFinancialFactsToMappedData(
      mapRawDataToMappedFinancialData(rawData),
      legacyFacts
    );

  const kpis = computeKpis(mappedData);
  const quantisScore = calculateQuantisScore(kpis);
  const facts = mapMappedDataToFinancialFacts(mappedData);

  const candidateYears = parsedData
    .map((item) => item.fiscalYear)
    .filter((year): year is number => year !== null && year <= 2030);
  const fiscalYear = candidateYears.length > 0 ? Math.max(...candidateYears) : null;

  const analysisDraft: AnalysisDraft = {
    userId: params.userId,
    folderName: params.folderName,
    createdAt: new Date().toISOString(),
    fiscalYear,
    sourceFiles: params.files.map((file) => ({
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      type: file.type
    })),
    parsedData,
    rawData,
    mappedData,
    financialFacts: facts,
    kpis,
    quantisScore,
    uploadContext: {
      companySize: params.uploadContext?.companySize?.trim() || null,
      sector: params.uploadContext?.sector?.trim() || null,
      source: params.uploadContext?.source ?? "dashboard"
    }
  };

  return analysisDraft;
}

function mapParsedDataToFacts(item: ParsedFileData): FinancialFacts {
  const facts: FinancialFacts = {
    revenue: null,
    expenses: null,
    payroll: null,
    treasury: null,
    receivables: null,
    payables: null,
    inventory: null
  };

  item.metrics.forEach((metric) => {
    facts[metric.key] = metric.value;
  });

  return facts;
}

function inferFiscalYearFromText(rawText: string): number | null {
  const matches = rawText.match(/20\d{2}/g);
  if (!matches) return null;
  const currentYear = new Date().getFullYear();
  const candidates = [...new Set(matches.map(Number))]
    .filter((y) => y >= 2015 && y <= currentYear + 1);
  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}
