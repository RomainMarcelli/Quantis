import type { DocumentAIExtractionResult } from "@/services/documentAI";

export type DocumentAIResponse = Pick<DocumentAIExtractionResult, "rawText" | "pages" | "tables">;

export type ParsedFinancialData = {
  incomeStatement: {
    revenue: number | null;
    production: number | null;
    totalProducts: number | null;
    totalCharges: number | null;
    netResult: number | null;
  };
  balanceSheet: {
    totalAssets: number | null;
    equity: number | null;
    debts: number | null;
  };
};

export type DetectedFinancialSections = {
  incomeStatement: boolean;
  balanceSheet: boolean;
};

type FieldExtraction = {
  label: string;
  value: number | null;
  line: string | null;
};

type SectionDetails = {
  detected: DetectedFinancialSections;
  incomeStatementRange: SectionRange;
  balanceSheetRange: SectionRange;
};

type SectionRange = {
  start: number;
  end: number;
} | null;

type AmountCandidate = {
  index: number;
  value: number;
};

const INCOME_STATEMENT_HEADING_PATTERNS = [/\bcompte\s+de\s+resultat\b/, /\bcompte\s+resultat\b/];
const BALANCE_SHEET_HEADING_PATTERNS = [/\bbilan\b/];
const INCOME_KEYWORDS = [/\bproduits?\b/, /\bcharges?\b/, /\bresultat\s+net\b/];
const BALANCE_KEYWORDS = [/\bactif\b/, /\bpassif\b/, /\bcapitaux?\s+propres?\b/];

const FIELD_PATTERNS = {
  incomeStatement: {
    revenue: [/\bventes?\s+de\s+marchandises?\b/, /\bventes?\b.*\bmarchandises?\b/],
    production: [
      /\bproduction\s+vendue\b/,
      /\bproduction\b.*\bvendue\b/,
      /\bchiffre\s+d[' ]?affaires\b/,
      /\bca\b/
    ],
    totalProducts: [
      /\btotal\b.*\bproduits?\b/,
      /\btotal\s+des?\s+produits?\b/,
      /\bproduits?\s+d[' ]?exploitation\b/
    ],
    totalCharges: [
      /\btotal\b.*\bcharges?\b/,
      /\btotal\s+des?\s+charges?\b/,
      /\bcharges?\s+d[' ]?exploitation\b/
    ],
    netResult: [
      /\bresultat\s+net\b/,
      /\bresultat\s+de\s+l'?exercice\b/,
      /\bbenefice\b/,
      /\bperte\b/
    ]
  },
  balanceSheet: {
    totalAssets: [/\btotal\b.*\bactif\b/, /\bactif\b.*\btotal\b/, /\btotal\s+general\b/],
    equity: [/\bcapitaux?\s+propres?\b/, /\btotal\s+i\b/],
    debts: [
      /\btotal\b.*\bdettes?\b/,
      /\bemprunts?\b.*\bdettes?\b/,
      /\bdettes?\b/,
      /\bpassif\s+circulant\b/
    ]
  }
} as const;

export function extractFinancialData(document: DocumentAIResponse): ParsedFinancialData {
  const lines = buildAnalysisLines(document);
  const sectionDetails = detectSectionDetails(lines);

  const incomeLines = getLinesForSection(lines, sectionDetails.incomeStatementRange);
  const balanceLines = getLinesForSection(lines, sectionDetails.balanceSheetRange);

  const revenue = findFieldValue(incomeLines, FIELD_PATTERNS.incomeStatement.revenue, "Ventes de marchandises");
  const production = findFieldValue(incomeLines, FIELD_PATTERNS.incomeStatement.production, "Production vendue");
  const totalProducts = findFieldValue(
    incomeLines,
    FIELD_PATTERNS.incomeStatement.totalProducts,
    "Total produits"
  );
  const totalCharges = findFieldValue(
    incomeLines,
    FIELD_PATTERNS.incomeStatement.totalCharges,
    "Total charges"
  );
  const netResult = findFieldValue(incomeLines, FIELD_PATTERNS.incomeStatement.netResult, "Resultat net");

  const totalAssets = findFieldValue(balanceLines, FIELD_PATTERNS.balanceSheet.totalAssets, "Total actif");
  const equity = findFieldValue(balanceLines, FIELD_PATTERNS.balanceSheet.equity, "Capitaux propres");
  const debts = findFieldValue(balanceLines, FIELD_PATTERNS.balanceSheet.debts, "Dettes");

  const result: ParsedFinancialData = {
    incomeStatement: {
      revenue: revenue.value,
      production: production.value,
      totalProducts: totalProducts.value,
      totalCharges: totalCharges.value,
      netResult: netResult.value
    },
    balanceSheet: {
      totalAssets: totalAssets.value,
      equity: equity.value,
      debts: debts.value
    }
  };

  console.info("[pdf-analysis] Sections detected", sectionDetails.detected);
  console.info("[pdf-analysis] Fields extracted", {
    revenue,
    production,
    totalProducts,
    totalCharges,
    netResult,
    totalAssets,
    equity,
    debts
  });

  if (allFieldsAreNull(result)) {
    const debugLines = lines
      .filter((line) => /\b(resultat|produit|charge|actif|passif|capitaux|dettes?)\b/i.test(normalizeText(line)))
      .slice(0, 25);

    console.warn("[pdf-analysis] No financial field extracted. Candidate lines snapshot:", debugLines);
  }

  return result;
}

export function detectFinancialSections(document: DocumentAIResponse): DetectedFinancialSections {
  const lines = buildAnalysisLines(document);
  const sectionDetails = detectSectionDetails(lines);

  return sectionDetails.detected;
}

function detectSectionDetails(lines: string[]): SectionDetails {
  const normalizedLines = lines.map((line) => normalizeText(line));
  const incomeStart = findFirstIndex(normalizedLines, INCOME_STATEMENT_HEADING_PATTERNS);
  const balanceStart = findFirstIndex(normalizedLines, BALANCE_SHEET_HEADING_PATTERNS);

  const incomeKeywordCount = countKeywordMatches(normalizedLines, INCOME_KEYWORDS);
  const balanceKeywordCount = countKeywordMatches(normalizedLines, BALANCE_KEYWORDS);

  const hasIncomeStatement = incomeStart !== -1 || incomeKeywordCount >= 2;
  const hasBalanceSheet = balanceStart !== -1 || balanceKeywordCount >= 2;

  const incomeStatementRange = hasIncomeStatement
    ? {
        start: incomeStart !== -1 ? incomeStart : 0,
        end: balanceStart !== -1 && balanceStart > (incomeStart !== -1 ? incomeStart : 0) ? balanceStart : lines.length
      }
    : null;

  const balanceSheetRange = hasBalanceSheet
    ? {
        start: balanceStart !== -1 ? balanceStart : 0,
        end: lines.length
      }
    : null;

  return {
    detected: {
      incomeStatement: hasIncomeStatement,
      balanceSheet: hasBalanceSheet
    },
    incomeStatementRange,
    balanceSheetRange
  };
}

function getLinesForSection(lines: string[], range: SectionRange): string[] {
  if (!range) {
    return lines;
  }
  return lines.slice(range.start, range.end);
}

function findFieldValue(lines: string[], patterns: readonly RegExp[], label: string): FieldExtraction {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const directNormalizedLine = normalizeText(line);
    let matchingPattern = patterns.find((pattern) => pattern.test(directNormalizedLine));
    let matchedRawLine = line;

    if (!matchingPattern && index + 1 < lines.length && extractAmountCandidates(line).length === 0) {
      const combinedLine = `${line} ${lines[index + 1] ?? ""}`.trim();
      const combinedNormalizedLine = normalizeText(combinedLine);
      matchingPattern = patterns.find((pattern) => pattern.test(combinedNormalizedLine));
      matchedRawLine = combinedLine;
    }

    if (!matchingPattern) {
      continue;
    }

    const extractionCandidates = [
      line,
      lines[index + 1] ?? "",
      lines[index + 2] ?? "",
      matchedRawLine
    ];

    for (const candidateLine of extractionCandidates) {
      const value = extractAmountFromLine(candidateLine, normalizeText(candidateLine), matchingPattern);
      if (value === null) {
        continue;
      }

      return {
        label,
        value,
        line: candidateLine
      };
    }
  }

  return {
    label,
    value: null,
    line: null
  };
}

function extractAmountFromLine(line: string, normalizedLine: string, pattern: RegExp): number | null {
  const match = normalizedLine.match(pattern);
  const anchorIndex = match?.index ?? 0;
  const anchorEndIndex = anchorIndex + (match?.[0]?.length ?? 0);
  const candidates = extractAmountCandidates(line);

  if (!candidates.length) {
    return null;
  }

  const candidatesAfterLabel = candidates.filter((candidate) => candidate.index >= anchorEndIndex);
  if (candidatesAfterLabel.length > 0) {
    return candidatesAfterLabel[0].value;
  }

  return candidates[candidates.length - 1].value;
}

function extractAmountCandidates(line: string): AmountCandidate[] {
  const candidates: AmountCandidate[] = [];
  const amountPattern = /-?\(?\d[\d\s\u00A0\u202F.,]*\)?/g;

  for (const match of line.matchAll(amountPattern)) {
    const raw = match[0];
    const value = parseFinancialAmount(raw);
    if (value === null) {
      continue;
    }

    const compact = raw.replace(/[\s\u00A0\u202F]/g, "");
    const digitsOnly = compact.replace(/\D/g, "");
    if (digitsOnly.length <= 3) {
      continue;
    }

    if (/^\d{4}$/.test(digitsOnly)) {
      const yearCandidate = Number(digitsOnly);
      if (yearCandidate >= 1900 && yearCandidate <= 2099) {
        continue;
      }
    }

    candidates.push({
      index: match.index ?? 0,
      value
    });
  }

  return candidates;
}

function parseFinancialAmount(rawValue: string): number | null {
  const isNegative = rawValue.includes("(") || rawValue.includes(")") || rawValue.includes("-");
  let cleaned = rawValue
    .replace(/\(/g, "")
    .replace(/\)/g, "")
    .replace(/-/g, "")
    .replace(/\s/g, "")
    .replace(/\u00A0/g, "")
    .replace(/\u202F/g, "")
    .replace(/[^\d,.\u0020]/g, "");

  if (!cleaned) {
    return null;
  }

  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");

  if (hasComma && hasDot) {
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    if (lastComma > lastDot) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (hasComma) {
    const decimalDigits = cleaned.split(",").at(-1)?.length ?? 0;
    cleaned = decimalDigits > 0 && decimalDigits <= 2 ? cleaned.replace(",", ".") : cleaned.replace(/,/g, "");
  } else if (hasDot) {
    const decimalDigits = cleaned.split(".").at(-1)?.length ?? 0;
    cleaned = decimalDigits > 0 && decimalDigits <= 2 ? cleaned : cleaned.replace(/\./g, "");
  }

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return isNegative ? -Math.abs(parsed) : parsed;
}

function buildAnalysisLines(document: DocumentAIResponse): string[] {
  const rawTextLines = splitLines(document.rawText);
  if (rawTextLines.length > 0) {
    return rawTextLines;
  }

  const pageFallbackLines = splitLines(collectTextFromUnknown(document.pages));
  if (pageFallbackLines.length > 0) {
    return pageFallbackLines;
  }

  return splitLines(collectTextFromUnknown(document.tables));
}

function collectTextFromUnknown(input: unknown): string {
  const values: string[] = [];
  collectTextValues(input, values);
  return values.join("\n");
}

function collectTextValues(input: unknown, values: string[]) {
  if (typeof input === "string") {
    if (input.trim().length > 0) {
      values.push(input);
    }
    return;
  }

  if (Array.isArray(input)) {
    input.forEach((item) => collectTextValues(item, values));
    return;
  }

  if (!isRecord(input)) {
    return;
  }

  Object.entries(input).forEach(([key, value]) => {
    if (typeof value === "string") {
      if (looksLikeTextField(key) && value.trim().length > 0) {
        values.push(value);
      }
      return;
    }
    collectTextValues(value, values);
  });
}

function splitLines(text: string | null | undefined): string[] {
  if (!text) {
    return [];
  }

  return text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function findFirstIndex(lines: string[], patterns: readonly RegExp[]): number {
  return lines.findIndex((line) => patterns.some((pattern) => pattern.test(line)));
}

function countKeywordMatches(lines: string[], patterns: readonly RegExp[]): number {
  return lines.reduce((count, line) => {
    const hasMatch = patterns.some((pattern) => pattern.test(line));
    return hasMatch ? count + 1 : count;
  }, 0);
}

function looksLikeTextField(key: string): boolean {
  const normalized = key.toLowerCase();
  return normalized.includes("text") || normalized.includes("content") || normalized.includes("mention");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function allFieldsAreNull(parsed: ParsedFinancialData): boolean {
  return (
    Object.values(parsed.incomeStatement).every((value) => value === null) &&
    Object.values(parsed.balanceSheet).every((value) => value === null)
  );
}
