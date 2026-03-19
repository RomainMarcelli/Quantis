import * as XLSX from "xlsx";
import { extractFinancialFactsFromRows } from "@/services/parsers/financialFactsExtractor";
import type { ParsedFileData } from "@/types/analysis";

export function parseExcelBuffer(buffer: Buffer, fileName: string): ParsedFileData {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    return emptyParsedData(fileName, "excel");
  }

  const firstSheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
    defval: null
  });

  const previewRows = rows.slice(0, 20).map((row) => sanitizeRow(row));
  const { facts, metrics } = extractFinancialFactsFromRows(rows);

  return {
    fileName,
    fileType: "excel",
    extractedAt: new Date().toISOString(),
    fiscalYear: inferFiscalYear(rows),
    metrics,
    previewRows: previewRows.length > 0 ? previewRows : [factsToPreviewRow(facts)]
  };
}

function inferFiscalYear(rows: Record<string, unknown>[]): number | null {
  const yearRegex = /(20\d{2})/;
  for (const row of rows.slice(0, 200)) {
    for (const value of Object.values(row)) {
      if (typeof value !== "string") {
        continue;
      }
      const match = value.match(yearRegex);
      if (match?.[1]) {
        return Number(match[1]);
      }
    }
  }
  return null;
}

function sanitizeRow(row: Record<string, unknown>): Record<string, string | number | null> {
  const formatted: Record<string, string | number | null> = {};

  Object.entries(row).forEach(([key, value]) => {
    if (typeof value === "string" || typeof value === "number" || value === null) {
      formatted[key] = value;
      return;
    }
    formatted[key] = String(value);
  });

  return formatted;
}

function factsToPreviewRow(facts: Record<string, number | null>): Record<string, string | number | null> {
  return {
    revenue: facts.revenue,
    expenses: facts.expenses,
    payroll: facts.payroll,
    treasury: facts.treasury,
    receivables: facts.receivables,
    payables: facts.payables,
    inventory: facts.inventory
  };
}

function emptyParsedData(fileName: string, fileType: ParsedFileData["fileType"]): ParsedFileData {
  return {
    fileName,
    fileType,
    extractedAt: new Date().toISOString(),
    fiscalYear: null,
    metrics: [],
    previewRows: []
  };
}

