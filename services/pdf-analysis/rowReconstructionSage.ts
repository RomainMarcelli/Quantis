import { parseFinancialAmount } from "@/services/pdf-analysis/amountParsing";
import {
  isSageBilanActifTerminator,
  isSageBilanPassifTerminator,
  matchSageBilanActifLabel,
  matchSageBilanPassifLabel,
  matchSageCdrLabel
} from "@/services/pdf-analysis/labelDictionarySage";
import type { FinancialFieldKey } from "@/services/pdf-analysis/types";

// Extraction des valeurs CDR depuis un rawText Sage.
//
// Structure rawText Sage : chaque libellé et chaque valeur sont sur leur propre
// ligne. Les valeurs sont émises en row-major pour la plupart des rows (label
// suivi de ses 2 valeurs N/N-1), mais certains groupes sont column-major :
//   - Produits 3-col : label + [France, Net N, Net N-1]
//   - Charges externes chunk : [Achats march, Var stock march] + [val1, val2, val3, val4]
//     (pattern column-major : N col puis N-1 col)
//
// Algorithme "pending group" :
//   - Un "groupe" est une séquence de labels consécutifs suivie d'un bloc de
//     valeurs consécutives, dans le flux de tokens (où les lignes noise comme
//     "France", "Net (N)", dates, subtotaux non-mappés sont filtrées).
//   - À chaque rencontre d'un nouveau label (si des valeurs ont déjà été
//     collectées pour le groupe courant), on FLUSH le groupe actuel.
//   - Flush applique une règle de distribution :
//       * L=1 et V>=1  → label[0] = values[0]
//       * L>1 et V==2*L → column-major : label[i] = values[i]  (cas Achats/Var stock)
//       * sinon (ambigu) → label[L-1] = values[0]  (cas des groupes avec
//         plusieurs labels vides en tête + 1 label non-vide en fin)
//
// Cette stratégie gère proprement TROIS V pour toutes les cibles linéaires
// (wages, socialCharges, externalCharges, totalOperatingCharges, salesGoods,
// netTurnover, netResult, etc.) ainsi que les groupes column-major V=2*L
// (Achats de marchandises + Variation de stock de marchandises).

export function extractSageCdrValues(rawText: string): Map<FinancialFieldKey, number> {
  const result = new Map<FinancialFieldKey, number>();
  if (!rawText) return result;

  // Scope à la section CDR (après le titre "Compte de Résultat (Première Partie)")
  // pour éviter toute contamination depuis les sections Bilan (Actif/Passif).
  const cdrStart = rawText.search(/Compte de R[ée]sultat \(Premi[èe]re Partie\)/i);
  if (cdrStart < 0) return result;
  const cdrText = rawText.slice(cdrStart);

  const lines = cdrText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  type Token =
    | { kind: "label"; field: FinancialFieldKey }
    | { kind: "number"; value: number };

  const tokens: Token[] = [];
  for (const line of lines) {
    const field = matchSageCdrLabel(line);
    if (field) {
      tokens.push({ kind: "label", field });
      continue;
    }
    const num = parseSageAmountLine(line);
    if (num !== null) {
      tokens.push({ kind: "number", value: num });
    }
    // Autres lignes (France, Export, Net (N), dates, section headers,
    // subtotaux non-mappés) : filtrées en "noise" et ignorées.
  }

  // Walk : un "pending group" s'accumule (labels + values) jusqu'au
  // prochain label qui suit des valeurs déjà collectées — à ce moment on flush.
  type PendingGroup = { labels: FinancialFieldKey[]; values: number[] };
  let pending: PendingGroup = { labels: [], values: [] };

  const flushGroup = () => {
    const { labels, values } = pending;
    const L = labels.length;
    const V = values.length;

    if (L === 0 || V === 0) {
      pending = { labels: [], values: [] };
      return;
    }

    if (L === 1) {
      setFirstTime(result, labels[0], values[0]);
    } else if (V === 2 * L) {
      // Column-major : label[i] = values[i] (premier tier = colonne Net N)
      for (let i = 0; i < L; i++) {
        setFirstTime(result, labels[i], values[i]);
      }
    } else {
      // Ambigu (V != 2*L, V != L) : attribuer la première valeur au
      // DERNIER label du groupe. Couvre le cas Sage où plusieurs rows
      // vides (Production stockée/immobilisée/Subventions) précèdent
      // un seul row non-vide (Autres produits) dans le même bloc.
      setFirstTime(result, labels[L - 1], values[0]);
    }

    pending = { labels: [], values: [] };
  };

  for (const tok of tokens) {
    if (tok.kind === "label") {
      // Si on a déjà des valeurs accumulées, flush avant d'ajouter le
      // nouveau label (ce label ouvre un nouveau groupe).
      if (pending.values.length > 0) {
        flushGroup();
      }
      pending.labels.push(tok.field);
    } else {
      // Valeur orpheline (aucun label en pending) → ignorer.
      if (pending.labels.length === 0) continue;
      pending.values.push(tok.value);
    }
  }

  // Flush du dernier groupe en fin de section (pour BÉNÉFICE OU PERTE).
  flushGroup();

  return result;
}

function setFirstTime(
  map: Map<FinancialFieldKey, number>,
  field: FinancialFieldKey,
  value: number
): void {
  // First-come-first-served : les duplicates (ex: RÉSULTAT D'EXPLOITATION
  // apparaît 2× aux pages 6 et 7) sont ignorés après la première extraction.
  if (!map.has(field)) {
    map.set(field, value);
  }
}

// ---------------------------------------------------------------------------
// Lot 7C — Extraction du bilan actif Sage.
// ---------------------------------------------------------------------------
//
// Structure du bilan actif Sage observée sur TROIS V :
//
//   Section immobilisations (lignes 0-65 dans la section scopée) :
//     - Tous les labels émis d'abord (IMMOB INCORP/CORP/FIN + détails)
//     - Puis tous les values en bloc (24 valeurs sur TROIS V)
//     - Les 4 DERNIÈRES valeurs = [Brut, Amort, Net(N), Net(N-1)] de
//       ACTIF IMMOBILISÉ (row total de la section)
//
//   Section actif circulant (lignes 66+) : layout linéaire row-major
//     - Chaque label est immédiatement suivi de ses 2-4 valeurs
//     - Pattern typique 3 valeurs [Brut, Net(N), Net(N-1)] quand Amort vide
//     - Pattern 4 valeurs [Brut, Amort, Net(N), Net(N-1)] pour TOTAL GÉNÉRAL
//
// L'algorithme "pending group" + règles de distribution v9 gère les deux
// sections uniformément en sélectionnant le Net(N) parmi les valeurs.

export function extractSageBilanActifValues(rawText: string): Map<FinancialFieldKey, number> {
  const result = new Map<FinancialFieldKey, number>();
  if (!rawText) return result;

  // Scope entre "Bilan Actif" et "Bilan Passif" (exclus). Garantit que la
  // seconde occurrence de "TOTAL GÉNÉRAL" (bilan passif) n'interfère pas.
  const actifStart = rawText.search(/Bilan\s+Actif/i);
  const passifStart = rawText.search(/Bilan\s+Passif/i);
  if (actifStart < 0) return result;
  const sectionEnd = passifStart > actifStart ? passifStart : rawText.length;
  const section = rawText.slice(actifStart, sectionEnd);

  const lines = section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  type Token =
    | { kind: "label"; field: FinancialFieldKey }
    | { kind: "terminator" }
    | { kind: "number"; value: number };

  const tokens: Token[] = [];
  for (const line of lines) {
    const field = matchSageBilanActifLabel(line);
    if (field) {
      tokens.push({ kind: "label", field });
      continue;
    }
    if (isSageBilanActifTerminator(line)) {
      tokens.push({ kind: "terminator" });
      continue;
    }
    const num = parseSageAmountLine(line);
    if (num !== null) {
      tokens.push({ kind: "number", value: num });
    }
  }

  // Walk : pending group accumule labels + values. Flush quand :
  //   - un nouveau label arrive APRÈS des valeurs déjà accumulées
  //   - un terminator arrive (flush + reset complet)
  //   - fin de section
  type PendingGroup = { labels: FinancialFieldKey[]; values: number[] };
  let pending: PendingGroup = { labels: [], values: [] };

  const flushGroup = () => {
    const { labels, values } = pending;
    const L = labels.length;
    const V = values.length;

    if (L > 0 && V > 0) {
      distributeValues(result, labels, values);
    }

    pending = { labels: [], values: [] };
  };

  for (const tok of tokens) {
    if (tok.kind === "terminator") {
      flushGroup();
      continue;
    }
    if (tok.kind === "label") {
      if (pending.values.length > 0) {
        flushGroup();
      }
      pending.labels.push(tok.field);
      continue;
    }
    // number
    if (pending.labels.length === 0) continue; // orphan
    pending.values.push(tok.value);
  }
  flushGroup();

  return result;
}

// Distribution des valeurs aux labels selon le layout Sage (règles v9).
//
// Règles pour L=1 (cas majoritaire row-total ou row-détail) :
//   V=1     → value[0]
//   V=2     → value[0]  (cas rare, Brut sans Amort ni Net séparé)
//   V=3     → value[1]  ([Brut, Net(N), Net(N-1)] — Amort vide)
//   V=4     → value[2]  ([Brut, Amort, Net(N), Net(N-1)])
//   V>4     → value[V-2]  (prend la 2e avant-dernière = Net(N) du dernier
//                          row [Brut, Amort, Net(N), Net(N-1)])
//             Utilisé pour ACTIF IMMOBILISÉ qui a 24 valeurs avant flush.
//
// Règles pour L>1 :
//   V=2*L   → label[i] = value[i]         (column-major simple)
//   V=3*L   → label[i] = value[i*3+1]     (3 colonnes par row, Net(N) = middle)
//   V=4*L   → label[i] = value[i*4+2]     (4 colonnes par row)
//   autre   → fallback : last label = value[0]  (groupes ambigus style
//             Prod stockée/immo/Subv/Autres produits du CDR)
function distributeValues(
  result: Map<FinancialFieldKey, number>,
  labels: readonly FinancialFieldKey[],
  values: readonly number[]
): void {
  const L = labels.length;
  const V = values.length;

  if (L === 1) {
    let netN: number;
    if (V === 1 || V === 2) {
      netN = values[0];
    } else if (V === 3) {
      netN = values[1];
    } else if (V === 4) {
      netN = values[2];
    } else {
      netN = values[V - 2];
    }
    setFirstTime(result, labels[0], netN);
    return;
  }

  if (V === 2 * L) {
    for (let i = 0; i < L; i++) {
      setFirstTime(result, labels[i], values[i]);
    }
    return;
  }

  if (V === 3 * L) {
    for (let i = 0; i < L; i++) {
      setFirstTime(result, labels[i], values[i * 3 + 1]);
    }
    return;
  }

  if (V === 4 * L) {
    for (let i = 0; i < L; i++) {
      setFirstTime(result, labels[i], values[i * 4 + 2]);
    }
    return;
  }

  // Fallback : la dernière label du groupe reçoit la première valeur.
  setFirstTime(result, labels[L - 1], values[0]);
}

// ---------------------------------------------------------------------------
// Lot 7D — Extraction du bilan passif Sage.
// ---------------------------------------------------------------------------
//
// Le bilan passif Sage a 2 colonnes par row (Net N | Net N-1) — pas de Brut
// ni Amort comme le bilan actif. Le layout est majoritairement linéaire
// (label → ses 2 valeurs) EXCEPTÉ pour la section capitaux propres qui est
// émise en column-major mixte (gérée par extractSageCapitauxPropresDetail).
//
// Règle de distribution spécifique bilan passif :
//   L=1, V>=1  → value[0]  (cas majoritaire : row linéaire avec 2 valeurs,
//                           prendre Net N = value[0])
//   V=2*L      → ROW-MAJOR label[i] = value[i*2]  (⚠ différent de bilan
//                actif Lot 7C qui était column-major)
//   autre      → fallback dernier label = value[0]
//
// Le groupe type V=2*L est [Dettes fournisseurs, Dettes fiscales] + 4 valeurs
// [324052, 316938, 18072, 23180] → row-major assigne fournisseurs=324052,
// fiscales=18072 (value[0] et value[2]).

export function extractSageBilanPassifValues(rawText: string): Map<FinancialFieldKey, number> {
  const result = new Map<FinancialFieldKey, number>();
  if (!rawText) return result;

  // Scope : entre "Bilan Passif" et "Compte de Résultat (Première Partie)"
  // (ou fin de document si le CDR n'est pas trouvé).
  const passifStart = rawText.search(/Bilan\s+Passif/i);
  if (passifStart < 0) return result;
  const cdrStart = rawText.search(/Compte de R[ée]sultat \(Premi[èe]re Partie\)/i);
  const sectionEnd = cdrStart > passifStart ? cdrStart : rawText.length;
  const section = rawText.slice(passifStart, sectionEnd);

  // Handler spécialisé pour la section capitaux propres (Capital / Rés. légale / RAN)
  const cpSpecial = extractSageCapitauxPropresDetail(section);
  for (const [field, value] of cpSpecial) {
    setFirstTime(result, field, value);
  }

  // Walker linéaire pour les autres fields (equity, borrowings, tradePayables,
  // taxSocialPayables, debts, totalLiabilities, …).
  const lines = section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  type Token =
    | { kind: "label"; field: FinancialFieldKey }
    | { kind: "terminator" }
    | { kind: "number"; value: number };

  const tokens: Token[] = [];
  for (const line of lines) {
    const field = matchSageBilanPassifLabel(line);
    if (field) {
      tokens.push({ kind: "label", field });
      continue;
    }
    if (isSageBilanPassifTerminator(line)) {
      tokens.push({ kind: "terminator" });
      continue;
    }
    const num = parseSageAmountLine(line);
    if (num !== null) {
      tokens.push({ kind: "number", value: num });
    }
  }

  type PendingGroup = { labels: FinancialFieldKey[]; values: number[] };
  let pending: PendingGroup = { labels: [], values: [] };

  const flushGroup = () => {
    const { labels, values } = pending;
    if (labels.length > 0 && values.length > 0) {
      distributePassifValues(result, labels, values);
    }
    pending = { labels: [], values: [] };
  };

  for (const tok of tokens) {
    if (tok.kind === "terminator") {
      flushGroup();
      continue;
    }
    if (tok.kind === "label") {
      if (pending.values.length > 0) {
        flushGroup();
      }
      pending.labels.push(tok.field);
      continue;
    }
    if (pending.labels.length === 0) continue;
    pending.values.push(tok.value);
  }
  flushGroup();

  return result;
}

// Distribution spécifique bilan passif : row-major pour V=2*L (contrairement
// au bilan actif Lot 7C qui utilise column-major).
function distributePassifValues(
  result: Map<FinancialFieldKey, number>,
  labels: readonly FinancialFieldKey[],
  values: readonly number[]
): void {
  const L = labels.length;
  const V = values.length;

  if (L === 1) {
    // Row linéaire simple : Net N = première valeur (Net N-1 ignorée).
    setFirstTime(result, labels[0], values[0]);
    return;
  }

  if (V === 2 * L) {
    // Row-major : label[i] a ses 2 valeurs consécutives [N, N-1].
    // On prend value[i*2] = Net N.
    for (let i = 0; i < L; i++) {
      setFirstTime(result, labels[i], values[i * 2]);
    }
    return;
  }

  // Fallback : dernier label reçoit la première valeur.
  setFirstTime(result, labels[L - 1], values[0]);
}

// Handler spécialisé pour la section Capitaux Propres Sage.
//
// Document AI émet cette section en column-major mixte que le walker
// générique ne peut pas décoder proprement :
//
//   Bloc 1 (valeurs positives) : entre "SITUATION NETTE" et "TOTAL situation
//     nette :". Contient les rows non-vides Capital et Réserve légale en
//     row-major. Layout TROIS V : [21600, 21600, 800, 800] = [Capital N,
//     Capital N-1, Réserve légale N, Réserve légale N-1].
//
//   Bloc 2 (valeurs négatives) : entre "TOTAL situation nette :" et
//     "CAPITAUX PROPRES". Contient Report à nouveau, Résultat de l'exercice
//     et Total situation nette en COLUMN-MAJOR 3 rows × 2 cols. Layout
//     TROIS V : [(225190), (8700), (211490), (215140), (10050), (202790)]
//     = [Report N, Résultat N, Total N, Report N-1, Résultat N-1, Total N-1].
//
// Extraction :
//   - shareCapital    = positiveValues[0]   (1ère valeur du bloc positif)
//   - legalReserves   = positiveValues[2]   (3ème valeur = 1ère du 2e pair)
//   - retainedEarnings = negativeValues[0]  (1ère valeur du bloc négatif
//                                            = Report à nouveau Net N en
//                                            column-major)
//
// LIMITATION (à adresser éventuellement en Lot 7D.2) : l'heuristique assume
// que Capital et Réserve légale sont les 2 premières rows non-vides du bloc
// positif. Si un autre client Sage a "Primes d'émission" ou "Écarts de
// réévaluation" non-vides, l'extraction serait décalée. Pour la robustesse
// générale, il faudrait un parsing par ancrage label→valeur plus sophistiqué.
function extractSageCapitauxPropresDetail(
  section: string
): Map<FinancialFieldKey, number> {
  const result = new Map<FinancialFieldKey, number>();

  const sitNetteStart = section.search(/SITUATION NETTE/i);
  if (sitNetteStart < 0) return result;
  const sitNetteTotalIdx = section.search(/TOTAL situation nette/i);
  const cpTotalIdx = section.search(/CAPITAUX PROPRES/i);

  // Bloc positif : [SITUATION NETTE, TOTAL situation nette[
  const positiveBlockEnd = sitNetteTotalIdx > sitNetteStart ? sitNetteTotalIdx : section.length;
  const positiveBlock = section.slice(sitNetteStart, positiveBlockEnd);
  const positiveValues = collectValuesSkippingNotes(positiveBlock);

  if (positiveValues.length >= 1) {
    result.set("shareCapital", positiveValues[0]);
  }
  if (positiveValues.length >= 3) {
    result.set("legalReserves", positiveValues[2]);
  }

  // Bloc négatif : [TOTAL situation nette, CAPITAUX PROPRES[
  if (sitNetteTotalIdx > 0 && cpTotalIdx > sitNetteTotalIdx) {
    const negativeBlock = section.slice(sitNetteTotalIdx, cpTotalIdx);
    const negativeValues = collectValuesSkippingNotes(negativeBlock);
    if (negativeValues.length >= 1) {
      result.set("retainedEarnings", negativeValues[0]);
    }
  }

  return result;
}

// Helper : collecte toutes les valeurs numériques d'un bloc rawText en
// skippant les lignes "dont versé" / "dont écart d'équivalence" qui sont
// des notes d'annotation (leurs valeurs adjacentes sont des détails inline
// et non les Net N/N-1).
function collectValuesSkippingNotes(block: string): number[] {
  const values: number[] = [];
  const lines = block.split(/\r?\n/).map((line) => line.trim());
  let skipNextNumber = false;
  for (const line of lines) {
    if (/^dont\s+vers[ée]$/i.test(line) || /^dont\s+[ée]cart\s+d['']?[ée]quivalence$/i.test(line)) {
      skipNextNumber = true;
      continue;
    }
    const num = parseSageAmountLine(line);
    if (num !== null) {
      if (skipNextNumber) {
        skipNextNumber = false;
        continue;
      }
      values.push(num);
    }
  }
  return values;
}

function parseSageAmountLine(line: string): number | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Rejeter les lignes contenant des lettres (libellés, dates avec mois…).
  if (/[a-zA-Zéèàçôêîû]/i.test(trimmed)) return null;

  // Rejeter les dates DD/MM/YYYY ou DD/MM/YY.
  if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(trimmed)) return null;

  // Rejeter les années seules (4 chiffres dans la plage 1900-2099).
  const digitsOnly = trimmed.replace(/\D/g, "");
  if (/^\d{4}$/.test(digitsOnly)) {
    const yearNum = Number(digitsOnly);
    if (yearNum >= 1900 && yearNum <= 2099) return null;
  }

  const parsed = parseFinancialAmount(trimmed);
  if (parsed === null || !Number.isFinite(parsed)) return null;
  if (parsed === 0) return null;
  return parsed;
}
