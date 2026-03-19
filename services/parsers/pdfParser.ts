import pdf from "pdf-parse";
import { extractFinancialFactsFromText } from "@/services/parsers/financialFactsExtractor";
import type { ParsedFileData } from "@/types/analysis";

export async function parsePdfBuffer(buffer: Buffer, fileName: string): Promise<ParsedFileData> {
  const parsedPdf = await pdf(buffer);
  const extractedText = parsedPdf.text ?? "";
  const { facts, metrics } = extractFinancialFactsFromText(extractedText);

  return {
    fileName,
    fileType: "pdf",
    extractedAt: new Date().toISOString(),
    fiscalYear: inferFiscalYear(extractedText),
    metrics,
    previewRows: [
      {
        pages: parsedPdf.numpages ?? null,
        textSample: extractedText.slice(0, 220),
        revenue: facts.revenue,
        expenses: facts.expenses,
        treasury: facts.treasury
      }
    ]
  };
}

function inferFiscalYear(text: string): number | null {
  const yearMatch = text.match(/(20\d{2})/);
  if (!yearMatch?.[1]) {
    return null;
  }
  return Number(yearMatch[1]);
}

