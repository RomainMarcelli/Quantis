import { parseFinancialAmount } from "@/services/pdf-analysis/amountParsing";
import { ALPHA_CODE_MAPPING_2050 } from "@/services/pdf-analysis/labelDictionary2050";

// Une ligne "alpha-coded" 2050 : un code (ex: FA, FW, HN) associé à sa valeur
// numérique, extraite du rawText Document AI par proximité séquentielle.
export type AlphaCodedRow = {
  code: string;
  value: number;
  line: number;
};

type Token =
  | { kind: "code"; value: string; line: number }
  | { kind: "number"; value: number; line: number };

// Regex d'un code alphabétique DGFiP :
//   - soit 2 lettres majuscules isolées (AA, BJ, FA, GF, HN, …)
//   - soit 1 chiffre + 1 lettre (1A, 1B, … — codes spéciaux DGFiP, ex: 1A = amort
//     de TOTAL GÉNÉRAL dans l'actif).
const ALPHA_CODE_PATTERN = /^(?:[A-Z]{2}|[1-9][A-Z])$/;

// Tokenise le rawText en flux séquentiel de tokens {code | number}.
// Toute autre chaîne est ignorée.
function tokenize(rawText: string): Token[] {
  const tokens: Token[] = [];
  const lines = rawText.split(/\r?\n/);

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    if (!line) continue;

    const parts = line.split(/[\s|,;()*]+/).filter((part) => part.length > 0);

    for (const part of parts) {
      if (ALPHA_CODE_PATTERN.test(part)) {
        tokens.push({ kind: "code", value: part, line: lineIdx });
        continue;
      }

      const num = parseFinancialAmount(part);
      if (num !== null && Number.isFinite(num) && num !== 0) {
        const digitsOnly = part.replace(/\D/g, "");
        // Min 2 chiffres : autorise les petites valeurs réelles (ex: EA=38 sur
        // AG FRANCE bilan passif) tout en rejetant les index de colonne à
        // 1 chiffre ("1", "2", "3" des en-têtes Brut/Amort/Net).
        if (digitsOnly.length >= 2 && !looksLikeYear(digitsOnly)) {
          tokens.push({ kind: "number", value: num, line: lineIdx });
        }
      }
    }
  }

  return tokens;
}

function looksLikeYear(digits: string): boolean {
  if (!/^\d{4}$/.test(digits)) return false;
  const year = Number(digits);
  return year >= 1900 && year <= 2099;
}

// Construit la liste des AlphaCodedRow à partir du rawText Document AI.
//
// Algorithme :
//   1. Tokeniser le rawText en flux de tokens {code, number}.
//   2. Pour chaque token "code" dont la valeur est dans ALPHA_CODE_MAPPING_2050,
//      regarder en avant jusqu'au prochain token number — en s'arrêtant si on
//      rencontre un autre code 2050 (le code suivant "revendique" ses propres
//      valeurs, interdit le squatting).
//   3. Si un number est trouvé, l'associer au code. Sinon, le code reste sans
//      valeur (non ajouté à la liste retournée).
//
// Cette stratégie gère proprement les 3 patterns rencontrés dans AG FRANCE :
//   Pattern A (colonne unique)    : "FW\n2676202" → FW = 2676202
//   Pattern B (3 colonnes inline) : "FA\n16047882 FB\nFC\n16047882"
//                                    → FA = 16047882, FC = 16047882, FB sans valeur
//   Pattern C (code en fin ligne) : "(VII) HD\n2603" → HD = 2603
export function buildAlphaCodedRows(rawText: string): AlphaCodedRow[] {
  if (!rawText || rawText.trim().length === 0) {
    return [];
  }

  const tokens = tokenize(rawText);
  const rows: AlphaCodedRow[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.kind !== "code") continue;
    if (!(token.value in ALPHA_CODE_MAPPING_2050)) continue;

    for (let j = i + 1; j < tokens.length; j++) {
      const next = tokens[j];
      if (next.kind === "code" && next.value in ALPHA_CODE_MAPPING_2050) {
        break;
      }
      if (next.kind === "number") {
        rows.push({ code: token.value, value: next.value, line: token.line });
        break;
      }
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Lot 6D — Extraction du bilan actif 2050 (3 colonnes Brut / Amort / Net).
// ---------------------------------------------------------------------------
//
// Chaque row du bilan actif possède 2 codes (un pour Brut, un pour Amort) mais
// AUCUN code pour la colonne Net — celle-ci est imprimée sans étiquette. Deux
// patterns se présentent dans le rawText Document AI :
//
//   Pattern 3 valeurs : "AT 2261651 AU 684784 1576866"
//                        → Brut=2261651, Amort=684784, Net=1576866
//
//   Pattern 2 valeurs : "AH 25000 AI 25000"   (Amort blank → cellule omise)
//                        → Brut=25000,   Amort=0,    Net=25000
//
// Règle : la DERNIÈRE valeur numérique du triplet est toujours le Net, car le
// formulaire 2050 garantit Net = Brut - Amort et la valeur Net est imprimée en
// dernière position de la row.
export type ActifRowExtract = {
  brut: number | null;
  amort: number | null;
  net: number | null;
};

export function extractActifRowValues(
  rawText: string,
  rowBrutCodes: readonly string[]
): Map<string, ActifRowExtract> {
  const result = new Map<string, ActifRowExtract>();
  for (const code of rowBrutCodes) {
    result.set(code, { brut: null, amort: null, net: null });
  }
  if (!rawText || rawText.trim().length === 0) {
    return result;
  }

  // Scope à la section BILAN ACTIF (avant BILAN PASSIF) pour éviter toute
  // collision avec les codes CDR/passif ou le texte narratif du rapport CAC.
  const actifStart = rawText.search(/BILAN\s*ACTIF/i);
  const passifStart = rawText.search(/BILAN\s*PASSIF/i);
  const section =
    actifStart >= 0 && passifStart > actifStart
      ? rawText.slice(actifStart, passifStart)
      : rawText;

  const tokens = tokenize(section);
  const brutCodeSet = new Set(rowBrutCodes);

  // Première occurrence (en token index) de chaque code brut tracké.
  const codeToTokenIdx = new Map<string, number>();
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind === "code" && brutCodeSet.has(t.value) && !codeToTokenIdx.has(t.value)) {
      codeToTokenIdx.set(t.value, i);
    }
  }

  // Tri par position dans le document.
  const orderedEntries = Array.from(codeToTokenIdx.entries()).sort(
    (left, right) => left[1] - right[1]
  );

  for (let k = 0; k < orderedEntries.length; k++) {
    const [code, startIdx] = orderedEntries[k];
    const endIdx =
      k + 1 < orderedEntries.length ? orderedEntries[k + 1][1] : tokens.length;

    // Collecte les (jusqu'à) 3 premières valeurs numériques dans la fenêtre.
    const values: number[] = [];
    for (let j = startIdx + 1; j < endIdx && values.length < 3; j++) {
      const t = tokens[j];
      if (t.kind === "number") {
        values.push(t.value);
      }
    }

    let brut: number | null = null;
    let amort: number | null = null;
    let net: number | null = null;
    if (values.length === 3) {
      [brut, amort, net] = values;
    } else if (values.length === 2) {
      brut = values[0];
      amort = 0;
      net = values[1];
    } else if (values.length === 1) {
      brut = values[0];
      amort = 0;
      net = values[0];
    }

    result.set(code, { brut, amort, net });
  }

  return result;
}
