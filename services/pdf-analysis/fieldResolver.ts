import { FIELD_DEFINITIONS } from "@/services/pdf-analysis/labelDictionary";
import type {
  AmountCandidate,
  CandidateTrace,
  FieldColumnStrategy,
  FieldDefinition,
  FieldSelectionTrace,
  FinancialFieldKey,
  ReconstructedRow,
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

  // Post-processing : si un champ avec sublineStrategy "sum" n'a pas été résolu via l'ancre,
  // tenter une sommation par contexte (scan de patterns connus dans la section — Bug 4).
  for (const definition of FIELD_DEFINITIONS) {
    if (
      definition.sublineStrategy === "sum" &&
      definition.sublinePatterns &&
      values[definition.key] === null
    ) {
      const sum = collectSublineSumByContext(rows, definition);
      if (sum !== null) {
        values[definition.key] = sum;
        const traceIndex = traces.findIndex((t) => t.field === definition.key);
        const contextTrace = {
          value: sum,
          score: 150,
          rowText: "subline-context-scan",
          page: 0,
          rowNumber: 0,
          columnIndex: 0,
          headerHint: null,
          reason: "subline_context_sum"
        };
        if (traceIndex >= 0) {
          traces[traceIndex] = { field: definition.key, selected: contextTrace, alternatives: [] };
        } else {
          traces.push({ field: definition.key, selected: contextTrace, alternatives: [] });
        }
      }
    }
  }

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
      // Bug 3 : label trouvé (ancre), pas de montant propre → sommer les sous-lignes.
      if (definition.sublineStrategy === "sum" && row.amountCandidates.length === 0) {
        const sublineSum = collectSublineSum(rows, rowIndex, definition);
        if (sublineSum !== null) {
          const syntheticCandidate: AmountCandidate = {
            raw: String(sublineSum),
            value: sublineSum,
            columnIndex: 0,
            headerHint: null,
            charIndex: 0
          };
          const score =
            computeCandidateScore({
              row,
              definition,
              amountCandidate: syntheticCandidate,
              labelMatch: fallbackByLineCode || fallbackBySectionContext ? 100 : labelMatch
            }) + contextualBoost;
          if (score > 0) {
            candidates.push({
              field: definition.key,
              value: sublineSum,
              score,
              reason: `subline_sum;score=${score}`,
              row,
              amountCandidate: syntheticCandidate
            });
          }
        }
      }
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

  // Les lignes issues du parsing structuré de tableau (table rows) bénéficient d'un léger bonus :
  // leurs candidats ont des indices de colonnes réels (cell positions), ce qui permet aux heuristiques
  // de sélection (both-≥2, netPriority) de fonctionner correctement. Les lignes texte (text rows) ont
  // des indices séquentiels (1, 2, 3…) qui déjouent ces heuristiques, notamment DEC-009 qui retourne
  // le candidat le plus à droite — i.e. N-1 au lieu de N pour un CDR multi-colonnes (BEL AIR).
  if (row.source === "table") {
    score += 10;
  }

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

    // Les cellules tableau peuvent contenir des codes lignes (ex: "060" → valeur=60) comme
    // artefacts. On filtre les candidats dont le raw a ≤ 3 chiffres (codes lignes) pour éviter
    // qu'ils décalent la sélection brut/amort/net vers la mauvaise colonne.
    const meaningful = amountCandidates.filter((candidate) => candidate.raw.replace(/\D/g, "").length > 3);
    const pool = meaningful.length >= 2 ? meaningful : amountCandidates;

    if (pool.length >= 4) {
      return pool[pool.length - 2] ?? null;
    }

    // Cas 2 candidats sans en-tête "net" détecté : le bilan actif BEL AIR a 3 colonnes
    // (Brut / Amort / Net) mais Document AI n'aligne pas toujours la colonne Net sur la bonne ligne.
    // → Deux patterns distincts :
    if (pool.length === 2) {
      const c0 = pool[0]; // colonne la plus à gauche (typiquement Brut)
      const c1 = pool[1]; // colonne suivante

      if (c0 && c1) {
        // Pattern "valeur fugace" : c1 est disproportionnée par rapport à c0 (> 20x).
        // C'est la valeur Net de la ligne précédente qui a glissé dans cette ligne. Retourner c0.
        if (c0.value > 0 && c1.value > c0.value * 20) {
          return c0;
        }

        // Pattern "Brut / Amortissements" : c0 > c1 > 0 avec un ratio cohérent (Amort ≥ 5% du Brut).
        // Net = Brut − Amort. On retourne un candidat synthétique.
        if (c0.value > 0 && c1.value > 0 && c0.value > c1.value && c1.value >= c0.value * 0.05) {
          const computedNet = c0.value - c1.value;
          return { ...c0, raw: String(computedNet), value: computedNet, headerHint: "computed_net" };
        }
      }
    }

    return pool[pool.length - 1] ?? null;
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

  // DEC-009 : fallback vers le candidat le plus à droite (col N dans une liasse 2 colonnes).
  return ordered[ordered.length - 1] ?? null;
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

/** Sélectionne le montant d'une sous-ligne selon la stratégie du champ parent. */
function pickSublineAmount(row: ReconstructedRow, strategy: FieldColumnStrategy): number | null {
  const meaningful = row.amountCandidates.filter(
    (c) => c.raw.replace(/\D/g, "").length > 3
  );
  const pool = meaningful.length >= 1 ? meaningful : row.amountCandidates;
  if (pool.length === 0) return null;

  if (strategy === "netPriority" || strategy === "nMinus1") {
    return pool[pool.length - 1]?.value ?? null;
  }
  // nCurrent / leftmost / signedRightmost : colonne la plus à gauche = valeur N
  const ordered = [...pool].sort((a, b) => a.columnIndex - b.columnIndex);
  return ordered[0]?.value ?? null;
}

/**
 * Bug 3 — Ancre trouvée sans montant : scanner les sous-lignes en avant jusqu'à un total ou
 * un changement de section, et sommer leurs montants.
 */
function collectSublineSum(
  rows: ReconstructedRow[],
  anchorIndex: number,
  definition: FieldDefinition
): number | null {
  const MAX_SCAN = 15;
  let total = 0;
  let count = 0;

  console.log(`[SUBLINE-DEBUG] collectSublineSum field="${definition.key}" section="${definition.section}" anchorIdx=${anchorIndex} anchorLabel="${rows[anchorIndex]?.normalizedLabel}"`);

  for (let i = anchorIndex + 1; i < rows.length && i <= anchorIndex + MAX_SCAN; i++) {
    const row = rows[i];
    if (!row) continue;
    if (row.section !== definition.section && row.section !== "unknown") {
      console.log(`[SUBLINE-DEBUG]   STOP section mismatch: row="${row.normalizedLabel}" rowSection="${row.section}" defSection="${definition.section}"`);
      break;
    }
    // Arrêter uniquement sur les totaux de section majeurs (Total I, Total actif, Total général…).
    // Les sous-totaux intermédiaires (Total créances, Total dettes…) ne doivent pas couper le scan.
    const isMajorSectionTotal =
      /\btotal\s*\((?:i{1,3}v?|vi{0,3}|[1-9])\)/.test(row.normalizedLabel) ||
      /\btotal\s+(?:actif|passif|g[eé]n[eé]ral|dettes|emprunts|capitaux)/.test(row.normalizedLabel) ||
      /\btotal\s+(?:i{1,3}|iv)\b/.test(row.normalizedLabel);
    if (isMajorSectionTotal) {
      console.log(`[SUBLINE-DEBUG]   STOP majorTotal: row="${row.normalizedLabel}"`);
      break;
    }
    if (row.amountCandidates.length === 0) {
      console.log(`[SUBLINE-DEBUG]   SKIP no-candidates: row="${row.normalizedLabel}"`);
      continue;
    }

    const amount = pickSublineAmount(row, definition.columnStrategy);
    console.log(`[SUBLINE-DEBUG]   row="${row.normalizedLabel}" amount=${amount} candidates=${JSON.stringify(row.amountCandidates.map(c => ({ v: c.value, col: c.columnIndex })))}`);
    if (amount !== null && Math.abs(amount) > 0) {
      total += amount;
      count++;
    }
  }

  console.log(`[SUBLINE-DEBUG]   → total=${total} count=${count} result=${count >= 1 ? total : null}`);
  return count >= 1 ? total : null;
}

/**
 * Bug 4 — Ancre absente du PDF : identifier les sous-lignes par leurs propres patterns
 * et sommer leurs montants. Nécessite ≥2 lignes correspondantes pour la confiance.
 */
function collectSublineSumByContext(
  rows: ReconstructedRow[],
  definition: FieldDefinition
): number | null {
  if (!definition.sublinePatterns || definition.sublinePatterns.length === 0) return null;

  console.log(`[SUBLINE-DEBUG] collectSublineSumByContext field="${definition.key}" patterns=${JSON.stringify(definition.sublinePatterns.map(p => p.source))}`);

  // Tentative 1 : filtre strict de section (definition.section + "unknown")
  let matchingRows = findRowsBySublinePatterns(rows, definition, /* strictSection */ true);
  console.log(`[SUBLINE-DEBUG]   strict match count=${matchingRows.length}`);

  // Tentative 2 : si moins de 2 matchs, relâcher le filtre de section (sous-lignes parfois mal
  // classifiées dans le parser — notamment dans les PDFs avec des sections mixtes).
  if (matchingRows.length < 2) {
    matchingRows = findRowsBySublinePatterns(rows, definition, /* strictSection */ false);
    console.log(`[SUBLINE-DEBUG]   relaxed match count=${matchingRows.length}`);
  }

  if (matchingRows.length < 2) {
    console.log(`[SUBLINE-DEBUG]   → null (insufficient matches)`);
    return null;
  }

  let total = 0;
  for (const row of matchingRows) {
    const amount = pickSublineAmount(row, definition.columnStrategy);
    console.log(`[SUBLINE-DEBUG]   matched row="${row.normalizedLabel}" amount=${amount} section="${row.section}" candidates=${JSON.stringify(row.amountCandidates.map(c => ({ v: c.value, col: c.columnIndex })))}`);
    if (amount !== null) total += amount;
  }

  console.log(`[SUBLINE-DEBUG]   → total=${total}`);
  return total;
}

function findRowsBySublinePatterns(
  rows: ReconstructedRow[],
  definition: FieldDefinition,
  strictSection: boolean
): ReconstructedRow[] {
  const result: ReconstructedRow[] = [];
  for (const row of rows) {
    if (strictSection && row.section !== definition.section && row.section !== "unknown") continue;
    if (row.amountCandidates.length === 0) continue;
    if (definition.sublinePatterns?.some((p) => p.test(row.normalizedLabel))) {
      result.push(row);
    }
  }
  return result;
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
