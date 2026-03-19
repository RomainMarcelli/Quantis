import { computeKpis } from "@/services/kpiEngine";
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
}): Promise<AnalysisDraft> {
  const parsedData = await Promise.all(params.files.map((file) => parseUploadedFile(file)));
  const rawData = mergeRawAnalysisData(parsedData.map((item) => item.rawData));
  const legacyFacts = mergeFinancialFacts(parsedData.map((item) => mapParsedDataToFacts(item)));
  const mappedData = applyLegacyFinancialFactsToMappedData(
    mapRawDataToMappedFinancialData(rawData),
    legacyFacts
  );
  const kpis = computeKpis(mappedData);
  const facts = mapMappedDataToFinancialFacts(mappedData);

  const candidateYears = parsedData.map((item) => item.fiscalYear).filter((year): year is number => year !== null);
  const fiscalYear = candidateYears.length > 0 ? candidateYears[0] : null;

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
    kpis
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
