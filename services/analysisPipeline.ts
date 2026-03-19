import { computeKpis } from "@/services/kpiEngine";
import { parseUploadedFile, type UploadedBinaryFile } from "@/services/parsers/fileParser";
import { mergeFinancialFacts } from "@/services/parsers/financialFactsExtractor";
import { saveAnalysis } from "@/services/repositories/analysisRepository";
import type { AnalysisRecord, FinancialFacts, NewAnalysisRecord, ParsedFileData } from "@/types/analysis";

export async function runAnalysisPipeline(params: {
  userId: string;
  files: UploadedBinaryFile[];
}): Promise<AnalysisRecord> {
  const parsedData = await Promise.all(params.files.map((file) => parseUploadedFile(file)));
  const facts = mergeFinancialFacts(parsedData.map((item) => mapParsedDataToFacts(item)));
  const kpis = computeKpis(facts);

  const candidateYears = parsedData.map((item) => item.fiscalYear).filter((year): year is number => year !== null);
  const fiscalYear = candidateYears.length > 0 ? candidateYears[0] : null;

  const analysisToSave: NewAnalysisRecord = {
    userId: params.userId,
    createdAt: new Date().toISOString(),
    fiscalYear,
    sourceFiles: params.files.map((file) => ({
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      type: file.type
    })),
    parsedData,
    financialFacts: facts,
    kpis
  };

  return saveAnalysis(analysisToSave);
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
