import { extractAmountCandidatesFromText, parseFinancialAmount } from "@/services/pdf-analysis/amountParsing";
import { SECTION_HEADING_PATTERNS, SECTION_KEYWORDS } from "@/services/pdf-analysis/labelDictionary";
import type {
  AmountCandidate,
  CdrLayout,
  DocumentAIResponse,
  ReconstructedRow,
  SectionKey
} from "@/services/pdf-analysis/types";

type RawLine = {
  page: number;
  rowNumber: number;
  text: string;
  normalizedText: string;
  section: SectionKey;
};

type SectionContext = {
  label: string;
  priority: number;
};

export function buildReconstructedRows(document: DocumentAIResponse): ReconstructedRow[] {
  const rawLines = buildRawLines(document.rawText);
  const textRows = buildTextRows(rawLines);
  const tableRows = buildTableRows(document, rawLines);

  const allRows = [...tableRows, ...textRows].sort((left, right) => {
    if (left.page !== right.page) {
      return left.page - right.page;
    }
    return left.rowNumber - right.rowNumber;
  });

  return allRows;
}

export function detectSectionsFromRows(rows: ReconstructedRow[]) {
  const hasIncome = rows.some((row) => row.section === "incomeStatement");
  const hasBalance = rows.some((row) => row.section === "balanceSheet");

  return {
    incomeStatement: hasIncome,
    balanceSheet: hasBalance
  };
}

// Détecte l'ordre des colonnes N vs N-1 dans le CDR à partir des ancres textuelles
// "Exercice clos" / "Exercice précédent". L'ordre de lecture de Document AI (gauche→droite,
// haut→bas) implique que la première ancre rencontrée correspond à la colonne la plus à gauche.
export function detectCdrLayout(rows: ReconstructedRow[]): CdrLayout {
  const closAnchor = findFirstAnchor(rows, /\bexercice\s+clos\b/);
  const precAnchor = findFirstAnchor(rows, /\bexercice\s+precedent\b/);

  if (!closAnchor || !precAnchor) {
    return "unknown";
  }

  if (closAnchor.page !== precAnchor.page) {
    return closAnchor.page < precAnchor.page ? "standard" : "inverted";
  }

  if (closAnchor.rowNumber !== precAnchor.rowNumber) {
    return closAnchor.rowNumber < precAnchor.rowNumber ? "standard" : "inverted";
  }

  return "unknown";
}

function findFirstAnchor(rows: ReconstructedRow[], pattern: RegExp): ReconstructedRow | null {
  for (const row of rows) {
    if (row.section === "balanceSheet") {
      continue;
    }
    if (pattern.test(row.normalizedLabel)) {
      return row;
    }
  }
  return null;
}

function buildRawLines(rawText: string): RawLine[] {
  const pages = splitPages(rawText);
  const rawLines: RawLine[] = [];

  pages.forEach((pageText, pageIndex) => {
    let currentSection: SectionKey = "unknown";
    pageText
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .forEach((line, lineIndex) => {
        const normalizedText = normalizeText(line);
        const headingSection = detectHeadingSection(normalizedText);
        if (headingSection !== "unknown") {
          currentSection = headingSection;
        }

        rawLines.push({
          page: pageIndex + 1,
          rowNumber: lineIndex + 1,
          text: line,
          normalizedText,
          section: inferSectionFromLine(normalizedText, currentSection)
        });
      });
  });

  return rawLines;
}

function buildTextRows(rawLines: RawLine[]): ReconstructedRow[] {
  const rows: ReconstructedRow[] = [];
  const sectionContexts = new Map<string, SectionContext>();
  let index = 0;

  while (index < rawLines.length) {
    const line = rawLines[index];
    if (!line) {
      index += 1;
      continue;
    }

    if (isAmountOnlyLine(line.text)) {
      index += 1;
      continue;
    }

    const inlineAmounts = extractAmountCandidatesFromText({ text: line.text });
    const baseLabel = extractLabelBeforeFirstAmount(line.text, inlineAmounts[0]?.charIndex ?? line.text.length);
    const sectionKey = buildSectionContextKey(line.page, line.section);
    const currentContext = sectionContexts.get(sectionKey) ?? null;
    const contextualLabel = resolveContextualLabel({
      baseLabel,
      section: line.section,
      context: currentContext
    });
    const normalizedLabel = normalizeText(contextualLabel || line.text);
    if (!normalizedLabel) {
      index += 1;
      continue;
    }

    const nextContext = extractSectionContext(baseLabel);
    if (nextContext && shouldReplaceContext(currentContext, nextContext)) {
      sectionContexts.set(sectionKey, nextContext);
    }

    const isCdrDebugRow = isCdrLabel(normalizedLabel);
    if (isCdrDebugRow) {
      console.log(`[CDR-DEBUG text] label="${contextualLabel}" | rawText="${line.text}" | inlineAmounts=${JSON.stringify(inlineAmounts)}`);
    }

    const lookaheadAmounts: AmountCandidate[] = [];
    let lookaheadIndex = index + 1;
    while (lookaheadIndex < rawLines.length) {
      const nextLine = rawLines[lookaheadIndex];
      if (!nextLine || nextLine.page !== line.page) {
        if (isCdrDebugRow) console.log(`[CDR-DEBUG text]   lookahead break: page change`);
        break;
      }
      if (!isAmountOnlyLine(nextLine.text)) {
        if (isCdrDebugRow) console.log(`[CDR-DEBUG text]   lookahead break: not amount-only: "${nextLine.text}"`);
        break;
      }

      const extracted = extractAmountCandidatesFromText({ text: nextLine.text });
      if (extracted.length > 0) {
        const first = extracted[0];
        if (first) {
          lookaheadAmounts.push({
            ...first,
            columnIndex: inlineAmounts.length + lookaheadAmounts.length + 1
          });
        }
      }

      lookaheadIndex += 1;
      if (lookaheadAmounts.length >= inferMaxLookaheadCandidates(contextualLabel)) {
        break;
      }
    }
    if (isCdrDebugRow) {
      console.log(`[CDR-DEBUG text]   → ${inlineAmounts.length} inline + ${lookaheadAmounts.length} lookahead candidates`);
    }

    const lineCode = extractLineCode(line.text);
    const amountCandidates = sanitizeAmountCandidatesWithLineCode(
      [...inlineAmounts, ...lookaheadAmounts].map((candidate, amountIndex) => ({
        ...candidate,
        columnIndex: amountIndex + 1
      })),
      lineCode
    );

    rows.push({
      rowId: `text-${line.page}-${line.rowNumber}`,
      source: "text",
      page: line.page,
      rowNumber: line.rowNumber,
      section: line.section,
      label: contextualLabel,
      normalizedLabel,
      fullText: line.text,
      lineCode,
      amountCandidates,
      headersByColumn: {}
    });

    index = lookaheadIndex > index + 1 ? lookaheadIndex : index + 1;
  }

  return rows;
}

function buildTableRows(document: DocumentAIResponse, rawLines: RawLine[]): ReconstructedRow[] {
  const tableRows: ReconstructedRow[] = [];
  const pageDefaults = computePageDefaultSections(rawLines);
  const pageTables = extractPageTables(document);

  pageTables.forEach(({ pageNumber, table }, tableIndex) => {
    const headerMap = buildHeaderMap(table, document.rawText);
    const bodyRows = getTableRows(table, "bodyRows");

    bodyRows.forEach((row, rowIndex) => {
      const cells = getCells(row);
      if (!cells.length) {
        return;
      }

      const cellTexts = cells.map((cell) => resolveCellText(cell, document.rawText));
      const fullText = cellTexts.join(" ").replace(/\s+/g, " ").trim();
      if (!fullText) {
        return;
      }

      const labelCellIndex = findBestLabelCellIndex(cellTexts);
      const label = (cellTexts[labelCellIndex] ?? "").trim() || fullText;
      const normalizedLabel = normalizeText(label);
      const amountCandidates = extractAmountCandidatesFromCells(cellTexts, headerMap, labelCellIndex);
      if (isCdrLabel(normalizedLabel)) {
        console.log(`[CDR-DEBUG table] p${pageNumber} label="${label}" | cells=${JSON.stringify(cellTexts)} | labelCellIdx=${labelCellIndex} | candidates=${JSON.stringify(amountCandidates.map(c => ({ v: c.value, col: c.columnIndex, h: c.headerHint })))}`);
      }
      if (!amountCandidates.length) {
        return;
      }

      const rowSection = inferSectionForTableRow({
        normalizedLabel,
        pageDefault: pageDefaults.get(pageNumber) ?? "unknown"
      });

      tableRows.push({
        rowId: `table-${pageNumber}-${tableIndex + 1}-${rowIndex + 1}`,
        source: "table",
        page: pageNumber,
        rowNumber: rowIndex + 1,
        section: rowSection,
        label,
        normalizedLabel,
        fullText,
        lineCode: extractLineCode(fullText),
        amountCandidates,
        headersByColumn: headerMap
      });
    });
  });

  return tableRows;
}

function extractPageTables(document: DocumentAIResponse): Array<{ pageNumber: number; table: Record<string, unknown> }> {
  const pageTables: Array<{ pageNumber: number; table: Record<string, unknown> }> = [];

  document.pages.forEach((page, pageIndex) => {
    if (!isRecord(page)) {
      return;
    }

    const tables = Array.isArray(page.tables) ? page.tables : [];
    tables.forEach((table) => {
      if (isRecord(table)) {
        pageTables.push({
          pageNumber: readNumericValue(page.pageNumber) ?? pageIndex + 1,
          table
        });
      }
    });
  });

  if (pageTables.length > 0) {
    return pageTables;
  }

  return document.tables
    .filter((table): table is Record<string, unknown> => isRecord(table))
    .map((table, index) => ({
      pageNumber: index + 1,
      table
    }));
}

function buildHeaderMap(table: Record<string, unknown>, documentText: string): Record<number, string> {
  const headerRows = getTableRows(table, "headerRows");
  const headerMap: Record<number, string> = {};

  headerRows.forEach((headerRow) => {
    const cells = getCells(headerRow);
    cells.forEach((cell, cellIndex) => {
      const text = normalizeText(resolveCellText(cell, documentText));
      if (!text) {
        return;
      }
      headerMap[cellIndex + 1] = text;
    });
  });

  return headerMap;
}

function extractAmountCandidatesFromCells(
  cellTexts: string[],
  headerMap: Record<number, string>,
  labelCellIndex: number
): AmountCandidate[] {
  const candidates: AmountCandidate[] = [];

  cellTexts.forEach((cellText, index) => {
    if (index === labelCellIndex) {
      return;
    }

    const trimmed = cellText.trim();
    if (!trimmed) {
      return;
    }

    const direct = parseFinancialAmount(trimmed);
    if (direct !== null && !looksLikeYear(trimmed)) {
      candidates.push({
        raw: trimmed,
        value: direct,
        columnIndex: index + 1,
        headerHint: headerMap[index + 1] ?? null,
        charIndex: 0
      });
      return;
    }

    const extracted = extractAmountCandidatesFromText({
      text: trimmed,
      headersByColumn: { 1: headerMap[index + 1] ?? "" }
    });

    extracted.forEach((candidate) => {
      candidates.push({
        ...candidate,
        columnIndex: index + 1,
        headerHint: headerMap[index + 1] ?? candidate.headerHint
      });
    });
  });

  return candidates;
}

function resolveCellText(cell: unknown, documentText: string): string {
  if (!isRecord(cell)) {
    return "";
  }

  if (typeof cell.text === "string") {
    return cell.text;
  }

  const layout = isRecord(cell.layout) ? cell.layout : null;
  if (!layout) {
    return "";
  }

  return resolveLayoutText(layout, documentText);
}

function resolveLayoutText(layout: Record<string, unknown>, documentText: string): string {
  const textAnchor = isRecord(layout.textAnchor) ? layout.textAnchor : null;
  if (!textAnchor) {
    return "";
  }

  const textSegments = Array.isArray(textAnchor.textSegments) ? textAnchor.textSegments : [];
  if (!textSegments.length) {
    return "";
  }

  const chunks = textSegments
    .map((segment) => {
      if (!isRecord(segment)) {
        return "";
      }

      const start = readNumericValue(segment.startIndex) ?? 0;
      const end = readNumericValue(segment.endIndex) ?? start;
      if (end <= start || start < 0 || end > documentText.length) {
        return "";
      }

      return documentText.slice(start, end);
    })
    .filter((chunk) => chunk.trim().length > 0);

  return chunks.join(" ").replace(/\s+/g, " ").trim();
}

function getTableRows(table: Record<string, unknown>, key: "headerRows" | "bodyRows"): Record<string, unknown>[] {
  const rows = table[key];
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.filter((row): row is Record<string, unknown> => isRecord(row));
}

function getCells(row: Record<string, unknown>): Record<string, unknown>[] {
  const cells = row.cells;
  if (!Array.isArray(cells)) {
    return [];
  }

  return cells.filter((cell): cell is Record<string, unknown> => isRecord(cell));
}

function computePageDefaultSections(rawLines: RawLine[]): Map<number, SectionKey> {
  const pageSections = new Map<number, SectionKey>();

  rawLines.forEach((line) => {
    if (line.section === "unknown") {
      return;
    }
    pageSections.set(line.page, line.section);
  });

  return pageSections;
}

function inferSectionForTableRow(input: {
  normalizedLabel: string;
  pageDefault: SectionKey;
}): SectionKey {
  const { normalizedLabel, pageDefault } = input;
  if (pageDefault !== "unknown") {
    return pageDefault;
  }

  if (includesAny(normalizedLabel, SECTION_KEYWORDS.incomeStatement)) {
    return "incomeStatement";
  }
  if (includesAny(normalizedLabel, SECTION_KEYWORDS.balanceSheet)) {
    return "balanceSheet";
  }

  return "unknown";
}

function findBestLabelCellIndex(cellTexts: string[]): number {
  let bestIndex = 0;
  let bestScore = Number.NEGATIVE_INFINITY;

  cellTexts.forEach((cellText, index) => {
    const text = cellText.trim();
    if (!text) {
      return;
    }

    const letters = (text.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
    const digits = (text.match(/\d/g) ?? []).length;
    const words = text.split(/\s+/g).filter((part) => part.length > 1).length;
    const pureNumber = /^-?\(?\d[\d\s\u00A0\u202F.,]*\)?$/.test(text);

    let score = letters * 2 + words * 3 - digits;
    if (pureNumber) {
      score -= 50;
    }
    if (looksLikeLineCode(text)) {
      score -= 35;
    }

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function inferSectionFromLine(normalizedLine: string, current: SectionKey): SectionKey {
  if (current === "balanceSheet" && isStrongIncomeLine(normalizedLine)) {
    return "incomeStatement";
  }

  if (current === "incomeStatement" && isStrongBalanceLine(normalizedLine)) {
    return "balanceSheet";
  }

  const matchesIncome = includesAny(normalizedLine, SECTION_KEYWORDS.incomeStatement);
  const matchesBalance = includesAny(normalizedLine, SECTION_KEYWORDS.balanceSheet);
  if (current === "unknown") {
    if (matchesIncome && !matchesBalance) {
      return "incomeStatement";
    }
    if (matchesBalance && !matchesIncome) {
      return "balanceSheet";
    }
  }

  if (current !== "unknown") {
    return current;
  }

  return "unknown";
}

function detectHeadingSection(normalizedLine: string): SectionKey {
  if (SECTION_HEADING_PATTERNS.incomeStatement.some((pattern) => pattern.test(normalizedLine))) {
    return "incomeStatement";
  }

  const hasActive = SECTION_HEADING_PATTERNS.balanceAssets.some((pattern) => pattern.test(normalizedLine));
  const hasPassive = SECTION_HEADING_PATTERNS.balanceLiabilities.some((pattern) => pattern.test(normalizedLine));
  if (hasActive || hasPassive) {
    return "balanceSheet";
  }

  return "unknown";
}

function extractLabelBeforeFirstAmount(text: string, firstAmountIndex: number): string {
  if (firstAmountIndex <= 0) {
    return text;
  }

  return text.slice(0, firstAmountIndex).replace(/\s+/g, " ").trim();
}

function splitPages(text: string): string[] {
  if (!text.trim()) {
    return [];
  }

  const pages = text.split(/\f+/g).map((page) => page.trim()).filter((page) => page.length > 0);
  if (pages.length > 0) {
    return pages;
  }

  return [text];
}

function extractLineCode(text: string): string | null {
  const directMatch = text.match(/\b\d{3}\b/);
  if (directMatch?.[0]) {
    return directMatch[0];
  }

  const compactTokens = text.match(/\b[0-9A-Za-z]{3}\b/g) ?? [];
  for (const token of compactTokens) {
    const normalized = normalizePotentialOcrLineCode(token);
    if (normalized) {
      return normalized;
    }
  }

  const splitDigits = text.match(
    /\b([0-9OQDISBZGlI])[\s\u00A0\u202F]+([0-9OQDISBZGlI])[\s\u00A0\u202F]+([0-9OQDISBZGlI])\b/
  );
  if (splitDigits) {
    const merged = `${splitDigits[1]}${splitDigits[2]}${splitDigits[3]}`;
    return normalizePotentialOcrLineCode(merged);
  }

  return null;
}

function looksLikeLineCode(text: string): boolean {
  const compact = text.replace(/\s+/g, "");
  return /^\d{2,4}$/.test(compact);
}

function normalizePotentialOcrLineCode(token: string): string | null {
  if (!/\d/.test(token)) {
    return null;
  }

  const normalized = token
    .toUpperCase()
    .replace(/[OQD]/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/Z/g, "2")
    .replace(/S/g, "5")
    .replace(/B/g, "8")
    .replace(/G/g, "6");

  return /^\d{3}$/.test(normalized) ? normalized : null;
}

function isAmountOnlyLine(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }

  if (/[A-Za-zÀ-ÿ]/.test(normalized)) {
    return false;
  }

  const compact = normalized.replace(/[\s\u00A0\u202F]/g, "");
  return /^-?\(?\d[\d.,]*\)?$/.test(compact);
}

function inferMaxLookaheadCandidates(label: string): number {
  const normalizedLabel = normalizeText(label);
  if (normalizedLabel.includes("total actif")) {
    return 4;
  }
  if (normalizedLabel.includes("total passif")) {
    return 2;
  }
  if (normalizedLabel.includes("total")) {
    return 3;
  }
  if (normalizedLabel.includes("resultat")) {
    return 3;
  }
  return 2;
}

function sanitizeAmountCandidatesWithLineCode(
  candidates: AmountCandidate[],
  lineCode: string | null
): AmountCandidate[] {
  if (!lineCode || candidates.length === 0) {
    return candidates;
  }

  const first = candidates[0];
  if (!first) {
    return candidates;
  }

  const lineCodePrefix = buildLineCodePrefixPattern(lineCode);
  if (!lineCodePrefix.test(first.raw)) {
    return candidates;
  }

  const rawWithoutCode = first.raw.replace(lineCodePrefix, "").trim();
  const reparsed = parseFinancialAmount(rawWithoutCode);
  if (reparsed === null) {
    return candidates;
  }

  const sanitizedFirst: AmountCandidate = {
    ...first,
    raw: rawWithoutCode,
    value: reparsed
  };

  return [sanitizedFirst, ...candidates.slice(1)];
}

function buildLineCodePrefixPattern(lineCode: string): RegExp {
  const ocrSafeDigits = lineCode
    .split("")
    .map((digit) => {
      switch (digit) {
        case "0":
          return "[0OQDoqd]";
        case "1":
          return "[1ILil]";
        case "2":
          return "[2Zz]";
        case "5":
          return "[5Ss]";
        case "6":
          return "[6Gg]";
        case "8":
          return "[8Bb]";
        default:
          return digit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      }
    })
    .join("[\\s\\u00A0\\u202F]*");

  return new RegExp(`^${ocrSafeDigits}[\\s\\u00A0\\u202F]+`);
}

function buildSectionContextKey(page: number, section: SectionKey): string {
  return `${page}-${section}`;
}

function resolveContextualLabel(input: {
  baseLabel: string;
  section: SectionKey;
  context: SectionContext | null;
}): string {
  const { baseLabel, section, context } = input;
  const normalizedBase = normalizeText(baseLabel);
  if (!normalizedBase) {
    return baseLabel;
  }

  const isGenericTotal = /^total\s*\(([ivx0-9]+)\)\b/.test(normalizedBase);
  if (section === "balanceSheet" && isGenericTotal && context?.label) {
    return `${context.label} ${baseLabel}`.trim();
  }

  return baseLabel;
}

function extractSectionContext(label: string): SectionContext | null {
  const normalized = normalizeText(label);
  if (!normalized) {
    return null;
  }

  if (normalized.includes("capitaux propres")) {
    return {
      label: "Capitaux propres",
      priority: 4
    };
  }

  if (normalized.includes("emprunts et dettes")) {
    return {
      label: "Emprunts et dettes",
      priority: 4
    };
  }

  if (normalized.includes("provisions pour risques et charges")) {
    return {
      label: "Provisions pour risques et charges",
      priority: 3
    };
  }

  if (normalized.includes("actif immobilise")) {
    return {
      label: "Actif immobilise",
      priority: 3
    };
  }

  if (normalized.includes("actif circulant")) {
    return {
      label: "Actif circulant",
      priority: 3
    };
  }

  if (normalized.includes("dettes fournisseurs")) {
    return {
      label: "Dettes fournisseurs",
      priority: 2
    };
  }

  if (normalized.includes("dettes fiscales et sociales")) {
    return {
      label: "Dettes fiscales et sociales",
      priority: 2
    };
  }

  return null;
}

function shouldReplaceContext(current: SectionContext | null, next: SectionContext): boolean {
  if (!current) {
    return true;
  }

  return next.priority >= current.priority;
}

function isStrongIncomeLine(normalizedLine: string): boolean {
  return [
    "ventes de marchandises",
    "production vendue",
    "chiffres d'affaires",
    "total des produits d'exploitation",
    "total des charges d'exploitation",
    "resultat exploitation",
    "resultat net",
    "compte de resultat"
  ].some((keyword) => normalizedLine.includes(normalizeText(keyword)));
}

function isStrongBalanceLine(normalizedLine: string): boolean {
  return [
    "capitaux propres",
    "emprunts et dettes",
    "total passif",
    "total actif",
    "dettes fournisseurs",
    "provisions pour risques et charges",
    "bilan"
  ].some((keyword) => normalizedLine.includes(normalizeText(keyword)));
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((needle) => haystack.includes(normalizeText(needle)));
}

function looksLikeYear(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (!/^\d{4}$/.test(digits)) {
    return false;
  }

  const year = Number(digits);
  return year >= 1900 && year <= 2099;
}

function readNumericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// DEBUG CDR — à retirer après investigation BEL AIR
const CDR_DEBUG_KEYWORDS = [
  "ventes de marchandises",
  "production vendue",
  "produits financiers",
  "charges financieres",
  "produits exceptionnels",
  "charges exceptionnelles",
  "charges de personnel",
  "salaires",
  "charges sociales",
  "autres charges d exploitation",
  "autres charges exploitation"
];
function isCdrLabel(normalizedLabel: string): boolean {
  return CDR_DEBUG_KEYWORDS.some((kw) => normalizedLabel.includes(kw));
}
