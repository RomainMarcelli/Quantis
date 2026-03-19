import { PDFParse } from "pdf-parse";
import { extractFinancialFactsFromText } from "@/services/parsers/financialFactsExtractor";
import { buildRawDataFromMetrics } from "@/services/parsers/rawDataExtractor";
import type { ParsedFileData } from "@/types/analysis";

export async function parsePdfBuffer(buffer: Buffer, fileName: string): Promise<ParsedFileData> {
  const parser = new PDFParse({
    data: new Uint8Array(buffer)
  });

  try {
    const textResult = await parser.getText();
    const extractedText = textResult.text ?? "";
    const { facts, metrics } = extractFinancialFactsFromText(extractedText);

    return {
      fileName,
      fileType: "pdf",
      extractedAt: new Date().toISOString(),
      fiscalYear: inferFiscalYear(extractedText),
      metrics,
      previewRows: [
        {
          pages: textResult.pages?.length ?? null,
          textSample: extractedText.slice(0, 220),
          revenue: facts.revenue,
          expenses: facts.expenses,
          treasury: facts.treasury
        }
      ],
      rawData: buildRawDataFromMetrics(metrics)
    };
  } finally {
    await parser.destroy();
  }
}

function inferFiscalYear(text: string): number | null {
  const yearMatch = text.match(/(20\d{2})/);
  if (!yearMatch?.[1]) {
    return null;
  }
  return Number(yearMatch[1]);
}
