import type { AmountCandidate } from "@/services/pdf-analysis/types";

const AMOUNT_PATTERN =
  /-?\(?\d{1,3}(?:[\s\u00A0\u202F]\d{3})+(?:[.,]\d+)?\)?|-?\(?\d+(?:[.,]\d+)?\)?/g;

export function extractAmountCandidatesFromText(input: {
  text: string;
  headersByColumn?: Record<number, string>;
  allowSmallValues?: boolean;
}): AmountCandidate[] {
  const { text, headersByColumn = {}, allowSmallValues = false } = input;
  const candidates: AmountCandidate[] = [];

  for (const match of text.matchAll(AMOUNT_PATTERN)) {
    const raw = match[0];
    const value = parseFinancialAmount(raw);
    if (value === null) {
      continue;
    }

    const digitsOnly = raw.replace(/\D/g, "");
    if (looksLikeYear(digitsOnly)) {
      continue;
    }
    if (!allowSmallValues && digitsOnly.length <= 3) {
      continue;
    }

    const columnIndex = candidates.length + 1;
    candidates.push({
      raw,
      value,
      columnIndex,
      headerHint: headersByColumn[columnIndex] ?? null,
      charIndex: match.index ?? 0
    });
  }

  return candidates;
}

export function parseFinancialAmount(rawValue: string): number | null {
  const negative = rawValue.includes("(") || rawValue.includes(")") || rawValue.includes("-");

  let cleaned = rawValue
    .replace(/\(/g, "")
    .replace(/\)/g, "")
    .replace(/-/g, "")
    .replace(/\s/g, "")
    .replace(/\u00A0/g, "")
    .replace(/\u202F/g, "")
    .replace(/[^\d,.]/g, "");

  if (!cleaned) {
    return null;
  }

  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");

  if (hasComma && hasDot) {
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    cleaned = lastComma > lastDot ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "");
  } else if (hasComma) {
    const decimalSize = cleaned.split(",").at(-1)?.length ?? 0;
    cleaned = decimalSize > 0 && decimalSize <= 2 ? cleaned.replace(",", ".") : cleaned.replace(/,/g, "");
  } else if (hasDot) {
    const decimalSize = cleaned.split(".").at(-1)?.length ?? 0;
    cleaned = decimalSize > 0 && decimalSize <= 2 ? cleaned : cleaned.replace(/\./g, "");
  }

  const value = Number(cleaned);
  if (!Number.isFinite(value)) {
    return null;
  }

  return negative ? -Math.abs(value) : value;
}

function looksLikeYear(digits: string): boolean {
  if (!/^\d{4}$/.test(digits)) {
    return false;
  }

  const year = Number(digits);
  return year >= 1900 && year <= 2099;
}
