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
import type { AnalysisDraft, FinancialFacts, ParsedFileData } from "@/types/analysis";

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
  const parsedData = await Promise.all(params.files.map((file) => parseUploadedFile(file)));
  const rawData = mergeRawAnalysisData(parsedData.map((item) => item.rawData));
  const legacyFacts = mergeFinancialFacts(parsedData.map((item) => mapParsedDataToFacts(item)));
  const mappedData = applyLegacyFinancialFactsToMappedData(
    mapRawDataToMappedFinancialData(rawData),
    legacyFacts
  );
  const kpis = computeKpis(mappedData);
  const quantisScore = calculateQuantisScore(kpis);
  const facts = mapMappedDataToFinancialFacts(mappedData);

  const candidateYears = parsedData.map((item) => item.fiscalYear).filter((year): year is number => year !== null);
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
