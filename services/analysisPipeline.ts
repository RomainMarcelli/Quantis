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
  const match = rawText.match(/(20\d{2})/);
  return match?.[1] ? Number(match[1]) : null;
}
