import { createEmptyRawAnalysisData } from "@/services/mapping/financialDataMapper";
import type { ParsedMetric, RawAnalysisData } from "@/types/analysis";

const METRIC_TO_VARIABLE_CODE: Record<string, string> = {
  revenue: "total_prod_expl",
  expenses: "total_charges_expl",
  payroll: "salaires",
  treasury: "dispo",
  receivables: "creances",
  payables: "fournisseurs",
  inventory: "total_stocks"
};

export function extractRawDataFromSheetRows(rows: unknown[][]): RawAnalysisData {
  const rawData = createEmptyRawAnalysisData();
  const headerIndex = findHeaderIndex(rows);
  const hasHeader = headerIndex !== -1;

  const columnIndex = hasHeader ? detectColumnIndex(rows[headerIndex] as unknown[]) : {};
  const startRow = hasHeader ? headerIndex + 1 : 0;

  for (let rowIndex = startRow; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] as unknown[];
    if (!Array.isArray(row) || row.length === 0) {
      continue;
    }

    const amount = detectAmount(row, columnIndex.value);
    if (amount === null) {
      continue;
    }

    const variableCandidate = getCellValue(row, columnIndex.variableCode);
    const variableCode = toVariableCode(variableCandidate);
    if (variableCode) {
      rawData.byVariableCode[variableCode] = amount;
    }

    const codeCandidate = getCellValue(row, columnIndex.code);
    const lineCodes = extractLineCodes(codeCandidate);
    lineCodes.forEach((lineCode) => {
      rawData.byLineCode[lineCode] = amount;
    });

    const labelCandidate = getCellValue(row, columnIndex.label) ?? row[0];
    const label = toNormalizedLabel(labelCandidate);
    if (label) {
      rawData.byLabel[label] = amount;
    }
  }

  return rawData;
}

export function mergeRawDataForSheets(items: RawAnalysisData[]): RawAnalysisData {
  const merged = createEmptyRawAnalysisData();

  items.forEach((item) => {
    mergeMaps(merged.byVariableCode, item.byVariableCode);
    mergeMaps(merged.byLineCode, item.byLineCode);
    mergeMaps(merged.byLabel, item.byLabel);
  });

  return merged;
}

export function buildRawDataFromMetrics(metrics: ParsedMetric[]): RawAnalysisData {
  const rawData = createEmptyRawAnalysisData();

  metrics.forEach((metric) => {
    const variableCode = METRIC_TO_VARIABLE_CODE[metric.key];
    if (!variableCode) {
      return;
    }
    rawData.byVariableCode[variableCode] = metric.value;
  });

  return rawData;
}

function findHeaderIndex(rows: unknown[][]): number {
  const headerKeywords = ["code", "variable", "valeur", "montant", "libelle"];

  for (let rowIndex = 0; rowIndex < Math.min(15, rows.length); rowIndex += 1) {
    const row = rows[rowIndex] as unknown[];
    const normalizedCells = row.map((cell) => normalizeText(String(cell ?? "")));
    if (headerKeywords.some((keyword) => normalizedCells.some((cell) => cell.includes(keyword)))) {
      return rowIndex;
    }
  }

  return -1;
}

function detectColumnIndex(headerRow: unknown[]): {
  label?: number;
  code?: number;
  variableCode?: number;
  value?: number;
} {
  const index: {
    label?: number;
    code?: number;
    variableCode?: number;
    value?: number;
  } = {};

  headerRow.forEach((cell, currentIndex) => {
    const value = normalizeText(String(cell ?? ""));
    const isVariableColumn = value.includes("variable");
    if (value.includes("libelle") || value.includes("source")) {
      index.label = currentIndex;
    }
    if (isVariableColumn) {
      index.variableCode = currentIndex;
    }
    if ((value === "code" || value.startsWith("code ")) && !isVariableColumn) {
      index.code = currentIndex;
    }
    if (value.includes("valeur") || value.includes("montant") || value.includes("balance")) {
      index.value = currentIndex;
    }
  });

  return index;
}

function detectAmount(row: unknown[], valueIndex?: number): number | null {
  if (typeof valueIndex === "number") {
    const parsed = parseAmount(row[valueIndex]);
    if (parsed !== null) {
      return parsed;
    }
  }

  const candidates = row
    .map((cell) => parseAmount(cell))
    .filter((value): value is number => value !== null && Number.isFinite(value));

  if (candidates.length === 0) {
    return null;
  }

  return candidates[candidates.length - 1];
}

function getCellValue(row: unknown[], index?: number): unknown {
  if (typeof index !== "number" || index < 0 || index >= row.length) {
    return undefined;
  }
  return row[index];
}

function extractLineCodes(value: unknown): string[] {
  if (typeof value !== "string" && typeof value !== "number") {
    return [];
  }
  const normalized = String(value);
  const matches = normalized.match(/\b\d{2,3}\b/g) ?? [];
  return Array.from(new Set(matches.map((item) => item.padStart(3, "0"))));
}

function toVariableCode(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = normalizeText(value).replace(/[^a-z0-9_]/g, "");
  return normalized.length > 0 ? normalized : null;
}

function toNormalizedLabel(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = normalizeText(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function parseAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value
    .replace(/\u00A0/g, " ")
    .replace(/\s/g, "")
    .replace(/[^0-9,.-]/g, "");

  if (!cleaned) {
    return null;
  }

  if (cleaned.includes(",") && cleaned.includes(".")) {
    const normalized = cleaned.replace(/\./g, "").replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const normalized = cleaned.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function mergeMaps(target: Record<string, number>, source: Record<string, number>) {
  Object.entries(source).forEach(([key, value]) => {
    target[key] = (target[key] ?? 0) + value;
  });
}
