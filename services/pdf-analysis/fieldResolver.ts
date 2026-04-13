import { FIELD_DEFINITIONS } from "@/services/pdf-analysis/labelDictionary";
import type {
  AmountCandidate,
  CandidateTrace,
  FieldColumnStrategy,
  FieldDefinition,
  FieldSelectionTrace,
  FinancialFieldKey,
  ReconstructedRow
} from "@/services/pdf-analysis/types";

type ScoredCandidate = {
  field: FinancialFieldKey;
  value: number;
  score: number;
  reason: string;
  row: ReconstructedRow;
  amountCandidate: AmountCandidate;
};

export function resolveFieldValues(rows: ReconstructedRow[]): {
  values: Record<FinancialFieldKey, number | null>;
  traces: FieldSelectionTrace[];
} {
  const values = {} as Record<FinancialFieldKey, number | null>;
  const traces: FieldSelectionTrace[] = [];

  FIELD_DEFINITIONS.forEach((definition) => {
    const scored = collectCandidatesForField(rows, definition)
      .sort((left, right) => right.score - left.score || Math.abs(right.value) - Math.abs(left.value));

    const selected = scored[0] ?? null;
    values[definition.key] = selected?.value ?? null;

    traces.push({
      field: definition.key,
      selected: selected ? toCandidateTrace(selected) : null,
      alternatives: scored.slice(1, 6).map(toCandidateTrace)
    });
  });

  return {
    values,
    traces
  };
}

function collectCandidatesForField(rows: ReconstructedRow[], definition: FieldDefinition): ScoredCandidate[] {
  const candidates: ScoredCandidate[] = [];

  rows.forEach((row, rowIndex) => {
    const contextualBoost = computeContextualBoost({ rows, rowIndex, row, definition });
    const labelMatch = getLabelMatchScore({
      normalizedLabel: row.normalizedLabel,
      definition
    });
    const hasExpectedLineCode = definition.expectedLineCodes?.includes(row.lineCode ?? "") ?? false;
    const fallbackByLineCode = labelMatch <= 0 && hasExpectedLineCode;
    const fallbackBySectionContext =
      labelMatch <= 0 &&
      !fallbackByLineCode &&
      contextualBoost >= 80 &&
      /^total\s*\((i|ii|1|2)\)/.test(row.normalizedLabel);

    if (labelMatch <= 0 && !fallbackByLineCode && !fallbackBySectionContext) {
      return;
    }

    if (
      (fallbackByLineCode || fallbackBySectionContext) &&
      row.section !== definition.section &&
      row.section !== "unknown"
    ) {
      return;
    }

    if (!fallbackByLineCode && !fallbackBySectionContext && isExcluded(row.normalizedLabel, definition.excludes)) {
      return;
    }

    const selectedAmount = selectAmountCandidate({
      amountCandidates: row.amountCandidates,
      strategy: definition.columnStrategy,
      definition,
      row
    });

    if (!selectedAmount) {
      return;
    }

    if (definition.allowNegative === false && selectedAmount.value < 0) {
      return;
    }

    if (definition.minAbs && Math.abs(selectedAmount.value) < definition.minAbs) {
      if (definition.kind === "total" || definition.kind === "result") {
        return;
      }
    }

    const score = computeCandidateScore({
      row,
      definition,
      amountCandidate: selectedAmount,
      labelMatch: fallbackByLineCode || fallbackBySectionContext ? 100 : labelMatch
    }) + contextualBoost;

    if (score <= 0) {
      return;
    }

    candidates.push({
      field: definition.key,
      value: selectedAmount.value,
      score,
      reason: buildReason({
        labelMatch,
        row,
        definition,
        amountCandidate: selectedAmount,
        score
      }),
      row,
      amountCandidate: selectedAmount
    });
  });

  return candidates;
}

function computeContextualBoost(input: {
  rows: ReconstructedRow[];
  rowIndex: number;
  row: ReconstructedRow;
  definition: FieldDefinition;
}): number {
  const { rows, rowIndex, row, definition } = input;
  const normalizedLabel = row.normalizedLabel;

  if (definition.key === "equity" && /^total\s*\((i|1)\)/.test(normalizedLabel)) {
    if (hasContextBefore({
      rows,
      rowIndex,
      page: row.page,
      rowNumber: row.rowNumber,
      maxRowDistance: 90,
      keywords: ["capitaux propres", "passif"]
    })) {
      return 80;
    }
  }

  if (definition.key === "debts" && /^total\s*\(iv\)/.test(normalizedLabel)) {
    if (hasContextBefore({
      rows,
      rowIndex,
      page: row.page,
      rowNumber: row.rowNumber,
      maxRowDistance: 120,
      keywords: ["emprunts et dettes"]
    })) {
      return 95;
    }
  }

  if (
    (definition.key === "totalFixedAssets" || definition.key === "totalFixedAssetsGross") &&
    /^total\s*\((i|1)\)/.test(normalizedLabel)
  ) {
    if (hasContextBefore({
      rows,
      rowIndex,
      page: row.page,
      rowNumber: row.rowNumber,
      maxRowDistance: 120,
      keywords: ["actif immobilise", "bilan actif"]
    })) {
      return 95;
    }
  }

  if (definition.key === "totalCurrentAssets" && /^total\s*\((ii|2)\)/.test(normalizedLabel)) {
    if (hasContextBefore({
      rows,
      rowIndex,
      page: row.page,
      rowNumber: row.rowNumber,
      maxRowDistance: 120,
      keywords: ["actif circulant", "bilan actif"]
    })) {
      return 95;
    }
  }

  return 0;
}

function getLabelMatchScore(input: {
  normalizedLabel: string;
  definition: FieldDefinition;
}): number {
  const { normalizedLabel, definition } = input;

  const aliasIndex = definition.aliases.findIndex((entry) => {
    const normalizedAlias = normalize(entry);
    if (!normalizedAlias) {
      return false;
    }

    if (normalizedAlias.length <= 3) {
      return new RegExp(`\\b${escapeRegExp(normalizedAlias)}\\b`).test(normalizedLabel);
    }

    return normalizedLabel.includes(normalizedAlias);
  });
  if (aliasIndex >= 0) {
    return 140 - aliasIndex * 2;
  }

  const regexIndex = definition.regexAliases.findIndex((entry) => entry.test(normalizedLabel));
  if (regexIndex >= 0) {
    return 120 - regexIndex * 2;
  }

  return 0;
}

function computeCandidateScore(input: {
  row: ReconstructedRow;
  definition: FieldDefinition;
  amountCandidate: AmountCandidate;
  labelMatch: number;
}): number {
  const { row, definition, amountCandidate, labelMatch } = input;
  let score = labelMatch;

  if (row.section === definition.section) {
    score += 55;
  } else if (row.section === "unknown") {
    score += 8;
  } else {
    score -= 45;
  }

  if (definition.kind === "total" && row.normalizedLabel.includes("total")) {
    score += 30;
  }

  if (definition.kind === "detail" && row.normalizedLabel.includes("total")) {
    score -= 18;
  }

  if (definition.kind === "result" && row.normalizedLabel.includes("resultat")) {
    score += 15;
  }

  if (definition.expectedLineCodes?.includes(row.lineCode ?? "")) {
    score += 50;
  }

  const abs = Math.abs(amountCandidate.value);
  if (definition.minAbs && abs < definition.minAbs) {
    score -= 35;
  }

  if (definition.allowNegative === false && amountCandidate.value < 0) {
    score -= 100;
  }

  if (amountCandidate.headerHint) {
    const header = amountCandidate.headerHint;
    if (definition.columnStrategy === "netPriority" && header.includes("net")) {
      score += 30;
    }
    if (definition.columnStrategy === "nCurrent" && isCurrentYearHeader(header)) {
      score += 25;
    }
    if (definition.columnStrategy === "nMinus1" && isPreviousYearHeader(header)) {
      score += 25;
    }
  }

  return Math.round(score);
}

function buildReason(input: {
  labelMatch: number;
  row: ReconstructedRow;
  definition: FieldDefinition;
  amountCandidate: AmountCandidate;
  score: number;
}): string {
  const { labelMatch, row, definition, amountCandidate, score } = input;
  const reasons = [
    `label=${labelMatch}`,
    `section=${row.section}`,
    `strategy=${definition.columnStrategy}`,
    `column=${amountCandidate.columnIndex}`,
    `score=${score}`
  ];

  if (definition.expectedLineCodes?.includes(row.lineCode ?? "")) {
    reasons.push(`lineCode=${row.lineCode}`);
  }

  if (amountCandidate.headerHint) {
    reasons.push(`header=${amountCandidate.headerHint}`);
  }

  return reasons.join(";");
}

function toCandidateTrace(candidate: ScoredCandidate): CandidateTrace {
  return {
    value: candidate.value,
    score: candidate.score,
    rowText: candidate.row.fullText,
    page: candidate.row.page,
    rowNumber: candidate.row.rowNumber,
    columnIndex: candidate.amountCandidate.columnIndex,
    headerHint: candidate.amountCandidate.headerHint,
    reason: candidate.reason
  };
}

function selectAmountCandidate(input: {
  amountCandidates: AmountCandidate[];
  strategy: FieldColumnStrategy;
  definition: FieldDefinition;
  row: ReconstructedRow;
}): AmountCandidate | null {
  const { amountCandidates, strategy, definition, row } = input;
  if (!amountCandidates.length) {
    return null;
  }

  if (strategy === "signedRightmost") {
    const negatives = amountCandidates.filter((candidate) => candidate.value < 0);
    if (negatives.length > 0) {
      return chooseLikelyCurrentCandidate(negatives);
    }
    return chooseLikelyCurrentCandidate(amountCandidates);
  }

  if (strategy === "netPriority") {
    const withNetHeader = amountCandidates.find((candidate) =>
      (candidate.headerHint ?? "").includes("net")
    );
    if (withNetHeader) {
      return withNetHeader;
    }

    if (amountCandidates.length >= 4) {
      return amountCandidates[amountCandidates.length - 2] ?? null;
    }

    return amountCandidates[amountCandidates.length - 1] ?? null;
  }

  if (strategy === "leftmost") {
    const ordered = [...amountCandidates].sort((left, right) => left.columnIndex - right.columnIndex);
    return ordered[0] ?? null;
  }

  if (strategy === "nCurrent") {
    const withCurrentHeader = amountCandidates.find((candidate) => isCurrentYearHeader(candidate.headerHint ?? ""));
    if (withCurrentHeader) {
      return withCurrentHeader;
    }

    if (definition.key === "equity" && row.normalizedLabel.includes("capitaux propres") && amountCandidates.length >= 2) {
      return amountCandidates[amountCandidates.length - 1] ?? null;
    }

    if (definition.section === "incomeStatement") {
      return chooseLikelyIncomeStatementCurrentCandidate(amountCandidates);
    }

    return chooseLikelyCurrentCandidate(amountCandidates);
  }

  if (strategy === "nMinus1") {
    const withPreviousHeader = amountCandidates.find((candidate) => isPreviousYearHeader(candidate.headerHint ?? ""));
    if (withPreviousHeader) {
      return withPreviousHeader;
    }

    return amountCandidates[amountCandidates.length - 1] ?? null;
  }

  return amountCandidates[amountCandidates.length - 1] ?? null;
}

function chooseLikelyCurrentCandidate(candidates: AmountCandidate[]): AmountCandidate | null {
  if (!candidates.length) {
    return null;
  }

  const ordered = [...candidates].sort((left, right) => left.columnIndex - right.columnIndex);
  const first = ordered[0];
  const second = ordered[1];
  if (!first) {
    return null;
  }
  if (!second) {
    return first;
  }

  const firstAbs = Math.abs(first.value);
  const secondAbs = Math.abs(second.value);
  const firstLooksLikeNoise = firstAbs > 0 && firstAbs < 500_000 && secondAbs > firstAbs * 5;
  if (firstLooksLikeNoise) {
    return second;
  }

  return first;
}

function chooseLikelyIncomeStatementCurrentCandidate(candidates: AmountCandidate[]): AmountCandidate | null {
  if (!candidates.length) {
    return null;
  }

  const ordered = [...candidates].sort((left, right) => left.columnIndex - right.columnIndex);
  if (ordered.length >= 3) {
    const first = ordered[0];
    const second = ordered[1];
    const third = ordered[2];
    if (first && second && third) {
      const firstAsCurrentDelta = first.value - second.value;
      const secondAsCurrentDelta = second.value - first.value;
      const tolerance = computeVariationTolerance(first.value, second.value, third.value);

      if (Math.abs(third.value - firstAsCurrentDelta) <= tolerance) {
        return first;
      }

      if (Math.abs(third.value - secondAsCurrentDelta) <= tolerance) {
        return second;
      }
    }
  }

  if (ordered.length === 1) {
    return ordered[0] ?? null;
  }

  const first = ordered[0];
  const second = ordered[1];
  if (!first || !second) {
    return ordered[0] ?? null;
  }

  const firstAbs = Math.abs(first.value);
  const secondAbs = Math.abs(second.value);
  const firstLooksLikeNoise = firstAbs > 0 && firstAbs < 100_000 && secondAbs > firstAbs * 5;
  if (firstLooksLikeNoise) {
    return second;
  }

  return second;
}

function computeVariationTolerance(left: number, right: number, delta: number): number {
  const magnitude = Math.max(Math.abs(left), Math.abs(right), Math.abs(delta), 1);
  return Math.max(2_000, magnitude * 0.02);
}

function isExcluded(normalizedLabel: string, excludes: readonly string[]): boolean {
  return excludes.some((item) => normalizedLabel.includes(normalize(item)));
}

function isCurrentYearHeader(header: string): boolean {
  const normalized = normalize(header);
  return /\b(n|exercice\s+n|annee\s+n)\b/.test(normalized) || /202[4-9]|203\d/.test(normalized);
}

function isPreviousYearHeader(header: string): boolean {
  const normalized = normalize(header);
  return /\b(n-1|n\s*-\s*1|exercice\s+n-1)\b/.test(normalized) || /201\d|202[0-3]/.test(normalized);
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasContextBefore(input: {
  rows: ReconstructedRow[];
  rowIndex: number;
  page: number;
  rowNumber: number;
  maxRowDistance: number;
  keywords: string[];
}): boolean {
  const { rows, rowIndex, page, rowNumber, maxRowDistance, keywords } = input;

  for (let index = rowIndex - 1; index >= 0; index -= 1) {
    const previous = rows[index];
    if (!previous) {
      continue;
    }

    if (previous.page < page) {
      break;
    }

    if (previous.page !== page) {
      continue;
    }

    if (rowNumber - previous.rowNumber > maxRowDistance) {
      break;
    }

    if (keywords.some((keyword) => previous.normalizedLabel.includes(normalize(keyword)))) {
      return true;
    }
  }

  return false;
}
