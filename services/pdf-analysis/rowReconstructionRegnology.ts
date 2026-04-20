import { parseFinancialAmount } from "@/services/pdf-analysis/amountParsing";
import {
  matchRegnologyBilanActifLabel,
  matchRegnologyBilanPassifLabel,
  matchRegnologyCdrLabel
} from "@/services/pdf-analysis/labelDictionaryRegnology";
import type {
  AmountCandidate,
  FinancialFieldKey,
  ReconstructedRow
} from "@/services/pdf-analysis/types";

// Extraction des valeurs Regnology à partir des rows reconstruites par
// buildReconstructedRows (pipeline 2033-sd réutilisé). Pas de walker
// pending-group car Regnology émet un layout tabulaire propre où chaque
// label partage sa ligne avec ses valeurs (4 colonnes actif, 2 colonnes
// passif/CDR).
//
// Règle de sélection de colonne :
//   - Bilan actif  (4 colonnes : Brut | Amort | Net N | Net N-1)
//       ≥ 3 candidats → index 2 (Net N)
//       ≤ 2 candidats → index 0 (ligne sans amortissement)
//   - Bilan passif (2 colonnes : N | N-1) → toujours index 0
//   - CDR          (2 colonnes : N | N-1) → toujours index 0
//
// Règles spéciales (issues du diagnostic JSON RIP CURL) :
//   1. salesGoods    : page 1 uniquement (éviter les annexes où le brut
//                      avant RRR est imprimé).
//   2. otherReceivables : label exact "Autres créances" — déjà garanti par
//                      l'ancrage ^...$ du dictionary.
//   3. taxSocialPayables : si la row a plus de 2 candidats → skip (cumul
//                      aberrant probable). La row est ignorée, pas posée
//                      à null, pour laisser une chance aux occurrences
//                      suivantes propres.
//   4. netResult     : scanné sur toutes les pages (ancre bas de CDR, pas
//                      restreint à page 1).
//
// First-come-first-served : la première row qui match un field gagne, les
// suivantes pour le même field sont ignorées. L'ordre des rows suit la
// lecture physique du PDF (page ↗, rowNumber ↗).

type LabelMatcher = (line: string) => FinancialFieldKey | null;

function selectBilanActifNetN(candidates: readonly AmountCandidate[]): number | null {
  const count = candidates.length;
  if (count === 0) return null;
  if (count >= 3) return candidates[2]?.value ?? null;
  return candidates[0]?.value ?? null;
}

function selectFirstColumn(candidates: readonly AmountCandidate[]): number | null {
  if (candidates.length === 0) return null;
  return candidates[0]?.value ?? null;
}

export function extractRegnologyBilanActifValues(
  rows: readonly ReconstructedRow[],
  matcher: LabelMatcher = matchRegnologyBilanActifLabel
): Map<FinancialFieldKey, number | null> {
  const result = new Map<FinancialFieldKey, number | null>();
  for (const row of rows) {
    if (row.section !== "balanceSheet") continue;
    const field = matcher(row.label);
    if (!field) continue;
    if (result.has(field)) continue;
    result.set(field, selectBilanActifNetN(row.amountCandidates));
  }
  return result;
}

// ---- Walker rawText dédié au bilan actif Regnology ----
//
// Raison d'être : `buildReconstructedRows` (pipeline 2033-sd générique) est
// calibré pour du 2 colonnes N/N-1. Sur les rows détail Regnology à 4 colonnes
// (Brut | Amort | Net N | Net N-1), il ne produit qu'un seul amountCandidate
// (le Brut), les 2 autres valeurs étant attribuées à des rows orphelines ou
// ignorées. Conséquence : ma règle `count >= 3 → index 2` ne se déclenche
// jamais sur les rows détail → on récupère du Brut au lieu du Net N.
//
// La solution : parser directement le rawText en mode pending-group (pattern
// Sage). On scope la section entre "BILAN ACTIF" et la première occurrence
// de "BILAN PASSIF" / "COMPTE DE RESULTAT". On marche ligne par ligne :
//   - Ligne = label connu du dict actif → démarre la collecte pour ce field
//   - Ligne numérique pure + collecte en cours → ajoute à la collecte
//   - Ligne non-label non-numérique → flush la collecte, applique la règle
//     de sélection (≥ 3 candidats = index 2, sinon index 0)
//   - Ligne = nouveau label → flush l'ancien et démarre un nouveau
// First-come-first-served : un field déjà présent dans le résultat n'est
// pas réécrit, pour éviter que des occurrences tardives (annexes) ne
// polluent les valeurs du CDR principal.
export function extractRegnologyBilanActifFromRawText(
  rawText: string
): Map<FinancialFieldKey, number | null> {
  const result = new Map<FinancialFieldKey, number | null>();
  if (!rawText) return result;

  const actifStart = rawText.search(/\bBILAN\s+ACTIF\b/i);
  if (actifStart < 0) return result;

  const afterStart = rawText.slice(actifStart);
  const passifIdx = afterStart.search(/\bBILAN\s+PASSIF\b/i);
  const cdrIdx = afterStart.search(/\bCOMPTE\s+DE\s+R[ÉE]?SULTAT\b/i);
  let endIdx = afterStart.length;
  if (passifIdx >= 0) endIdx = Math.min(endIdx, passifIdx);
  if (cdrIdx >= 0) endIdx = Math.min(endIdx, cdrIdx);
  const section = afterStart.slice(0, endIdx);

  type Pending = {
    field: FinancialFieldKey;
    candidates: number[];
  };
  let pending: Pending | null = null;

  const flushPending = (): void => {
    if (!pending) return;
    if (!result.has(pending.field)) {
      result.set(pending.field, selectBilanActifNetNFromNumbers(pending.candidates));
    }
    pending = null;
  };

  for (const rawLine of section.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const field = matchRegnologyBilanActifLabel(line);
    if (field) {
      flushPending();
      pending = { field, candidates: [] };
      continue;
    }

    if (pending && isPurelyNumericLine(line)) {
      const value = parseFinancialAmount(line);
      if (value !== null) pending.candidates.push(value);
      continue;
    }

    if (pending) flushPending();
  }
  flushPending();

  return result;
}

function isPurelyNumericLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  // Accepte : signe moins optionnel, parenthèses optionnelles, chiffres,
  // espaces (classiques, insécables, fines), et décimale optionnelle.
  return /^[-(]?[\d\s\u00A0\u202F]+(?:[.,]\d+)?[)]?$/.test(trimmed);
}

function selectBilanActifNetNFromNumbers(candidates: readonly number[]): number | null {
  const count = candidates.length;
  if (count === 0) return null;
  if (count >= 3) return candidates[2] ?? null;
  return candidates[0] ?? null;
}

export function extractRegnologyBilanPassifValues(
  rows: readonly ReconstructedRow[],
  matcher: LabelMatcher = matchRegnologyBilanPassifLabel
): Map<FinancialFieldKey, number | null> {
  const result = new Map<FinancialFieldKey, number | null>();
  for (const row of rows) {
    if (row.section !== "balanceSheet") continue;
    const field = matcher(row.label);
    if (!field) continue;
    if (result.has(field)) continue;

    // Règle spéciale 3 : dettes fiscales et sociales avec > 2 candidats
    // = cumul aberrant → skip (pas de set, ouvre la porte aux rows suivantes).
    if (field === "taxSocialPayables" && row.amountCandidates.length > 2) {
      continue;
    }

    result.set(field, selectFirstColumn(row.amountCandidates));
  }
  return result;
}

export function extractRegnologyCdrValues(
  rows: readonly ReconstructedRow[],
  matcher: LabelMatcher = matchRegnologyCdrLabel
): Map<FinancialFieldKey, number | null> {
  const result = new Map<FinancialFieldKey, number | null>();
  for (const row of rows) {
    if (row.section !== "incomeStatement") continue;
    const field = matcher(row.label);
    if (!field) continue;
    if (result.has(field)) continue;

    // Règle spéciale 1 : salesGoods uniquement sur la page 1 (CDR principal,
    // pas les annexes qui peuvent imprimer le brut avant RRR).
    if (field === "salesGoods" && row.page !== 1) {
      continue;
    }

    result.set(field, selectFirstColumn(row.amountCandidates));
  }
  return result;
}
