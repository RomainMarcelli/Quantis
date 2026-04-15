import {
  matchFusalpBilanActifLabel,
  matchFusalpBilanPassifLabel,
  matchFusalpCdrLabel
} from "@/services/pdf-analysis/labelDictionaryFusalp";
import type { DocumentAIResponse, FinancialFieldKey } from "@/services/pdf-analysis/types";

// Extracteur spatial pour les liasses Fiducial Audit (ex : Fusalp).
//
// Architecture identique à spatialExtractorRegnology : on reconstitue des
// "lignes visuelles" à partir des tokens Document AI (qui fournissent les
// coordonnées normalisées 0-1 via normalizedVertices) puis on matche chaque
// ligne contre les 3 dictionnaires Fiducial (actif, passif, CDR).
//
// Particularités Fusalp vs Regnology :
//   - Tokens orientation PAGE_UP uniquement (pas de PAGE_LEFT rotation 90°).
//     Les bilans Fusalp sont imprimés à l'horizontale, pas en rotation.
//   - MAX_PAGE_NUMBER = 5 (cover + bilan actif + bilan passif + CDR + CDR suite).
//     Les pages au-delà sont les annexes qui dupliquent les chiffres et
//     créent des faux positifs si non filtrées.
//   - CDR tri-colonne : 3 colonnes France | Export | Total (+ Total N-1).
//     Règle de sélection :
//       * 3+ candidats → index 2 (Total N)
//       * 2 candidats → somme si ratio smaller/larger ∈ [0.05, 0.65] (probable
//         [France, Export] avec Total perdu par l'OCR), sinon index 0
//       * 1 candidat  → index 0
//   - Bilan actif : 4 colonnes Brut | Amort | Net N | Net N-1 → index 2 (Net N)
//   - Bilan passif : 2 colonnes N | N-1 → index 0 (N)

const GROUP_TOLERANCE = 0.005;
const COLUMN_GAP_THRESHOLD = 0.04;
const MAX_PAGE_NUMBER = 5;
const CDR_RATIO_MIN = 0.05;
const CDR_RATIO_MAX = 0.65;

export type VisualLineOrientation = "PAGE_LEFT" | "PAGE_UP" | "OTHER";

export type VisualLine = {
  text: string;
  tokens: string[];
  minX: number;
  avgY: number;
  orientation: VisualLineOrientation;
  pageNumber: number;
};

type RawTextSegment = {
  startIndex?: string | number;
  endIndex?: string | number;
};

type RawNormalizedVertex = {
  x?: number;
  y?: number;
};

type RawToken = {
  layout?: {
    orientation?: string;
    textAnchor?: {
      textSegments?: RawTextSegment[];
    };
    boundingPoly?: {
      normalizedVertices?: RawNormalizedVertex[];
    };
  };
};

type RawPage = {
  pageNumber?: number | string;
  tokens?: RawToken[];
};

type RawDocument = {
  pages?: RawPage[];
};

type ResolvedToken = {
  text: string;
  orientation: VisualLineOrientation;
  x: number;
  y: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export function buildFusalpVisualLines(document: DocumentAIResponse): VisualLine[] {
  const rawText = document.rawText ?? "";
  const rawDoc = document as unknown as RawDocument;
  const pages = rawDoc.pages ?? [];

  const result: VisualLine[] = [];

  for (const page of pages) {
    const pageNumber = parsePageNumber(page.pageNumber);
    if (pageNumber === null || pageNumber < 1 || pageNumber > MAX_PAGE_NUMBER) continue;

    const tokens = page.tokens ?? [];
    if (tokens.length === 0) continue;

    const resolved = resolveTokens(tokens, rawText);
    if (resolved.length === 0) continue;

    const byOrientation = partitionByOrientation(resolved);
    for (const [orientation, orientTokens] of byOrientation) {
      const lines = groupIntoLines(orientTokens, orientation);
      for (const lineTokens of lines) {
        const ordered = sortWithinLine(lineTokens, orientation);
        result.push(buildVisualLine(ordered, orientation, pageNumber));
      }
    }
  }

  return result;
}

function parsePageNumber(raw: number | string | undefined): number | null {
  if (raw === undefined || raw === null) return null;
  const parsed = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveTokens(tokens: readonly RawToken[], rawText: string): ResolvedToken[] {
  const resolved: ResolvedToken[] = [];
  for (const token of tokens) {
    const text = extractTokenText(token, rawText);
    if (!text) continue;

    const centroid = computeTokenCentroid(token);
    if (!centroid) continue;

    resolved.push({
      text,
      orientation: readOrientation(token),
      x: centroid.x,
      y: centroid.y,
      minX: centroid.minX,
      maxX: centroid.maxX,
      minY: centroid.minY,
      maxY: centroid.maxY
    });
  }
  return resolved;
}

function extractTokenText(token: RawToken, rawText: string): string {
  const segments = token.layout?.textAnchor?.textSegments ?? [];
  let text = "";
  for (const seg of segments) {
    const start = Number(seg.startIndex ?? 0);
    const end = Number(seg.endIndex ?? 0);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      text += rawText.slice(start, end);
    }
  }
  return text.replace(/\s+/g, " ").trim();
}

function computeTokenCentroid(
  token: RawToken
): {
  x: number;
  y: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} | null {
  const vertices = token.layout?.boundingPoly?.normalizedVertices ?? [];
  if (vertices.length === 0) return null;

  let sumX = 0;
  let sumY = 0;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let count = 0;
  for (const v of vertices) {
    if (typeof v.x !== "number" || typeof v.y !== "number") continue;
    sumX += v.x;
    sumY += v.y;
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
    count += 1;
  }
  if (count === 0) return null;
  return {
    x: sumX / count,
    y: sumY / count,
    minX,
    maxX,
    minY,
    maxY
  };
}

function readOrientation(token: RawToken): VisualLineOrientation {
  const raw = token.layout?.orientation;
  if (raw === "PAGE_LEFT" || raw === "PAGE_UP") return raw;
  return "OTHER";
}

function partitionByOrientation(
  tokens: readonly ResolvedToken[]
): Map<VisualLineOrientation, ResolvedToken[]> {
  const map = new Map<VisualLineOrientation, ResolvedToken[]>();
  for (const token of tokens) {
    const bucket = map.get(token.orientation);
    if (bucket) {
      bucket.push(token);
    } else {
      map.set(token.orientation, [token]);
    }
  }
  return map;
}

function groupIntoLines(
  tokens: readonly ResolvedToken[],
  orientation: VisualLineOrientation
): ResolvedToken[][] {
  const keyOf = (token: ResolvedToken): number =>
    orientation === "PAGE_LEFT" ? token.x : token.y;

  const sorted = [...tokens].sort((a, b) => keyOf(a) - keyOf(b));

  const lines: ResolvedToken[][] = [];
  for (const token of sorted) {
    const current = lines[lines.length - 1];
    if (current && current.length > 0) {
      const lastKey = keyOf(current[current.length - 1]);
      if (Math.abs(keyOf(token) - lastKey) <= GROUP_TOLERANCE) {
        current.push(token);
        continue;
      }
    }
    lines.push([token]);
  }
  return lines;
}

function sortWithinLine(
  tokens: readonly ResolvedToken[],
  orientation: VisualLineOrientation
): ResolvedToken[] {
  if (orientation === "PAGE_LEFT") {
    return [...tokens].sort((a, b) => b.y - a.y);
  }
  return [...tokens].sort((a, b) => a.x - b.x);
}

function buildVisualLine(
  ordered: readonly ResolvedToken[],
  orientation: VisualLineOrientation,
  pageNumber: number
): VisualLine {
  const tokens = ordered.map((t) => t.text);
  const parts: string[] = [];
  for (let i = 0; i < ordered.length; i += 1) {
    if (i > 0) {
      const gap = computeReadingGap(ordered[i - 1], ordered[i], orientation);
      parts.push(gap > COLUMN_GAP_THRESHOLD ? "|" : " ");
    }
    parts.push(ordered[i].text);
  }
  const text = parts.join("");
  const minX = ordered.reduce((acc, t) => Math.min(acc, t.minX), Number.POSITIVE_INFINITY);
  const avgY = ordered.reduce((acc, t) => acc + t.y, 0) / ordered.length;
  return {
    text,
    tokens,
    minX,
    avgY,
    orientation,
    pageNumber
  };
}

function computeReadingGap(
  prev: ResolvedToken,
  curr: ResolvedToken,
  orientation: VisualLineOrientation
): number {
  if (orientation === "PAGE_LEFT") {
    return prev.minY - curr.maxY;
  }
  return curr.minX - prev.maxX;
}

// ---- Extraction des valeurs financières depuis les lignes visuelles ----

export type FusalpExtractionResult = {
  bilanActif: Map<FinancialFieldKey, number | null>;
  bilanPassif: Map<FinancialFieldKey, number | null>;
  cdr: Map<FinancialFieldKey, number | null>;
};

export function extractFusalpValuesFromVisualLines(
  visualLines: readonly VisualLine[]
): FusalpExtractionResult {
  const bilanActif = new Map<FinancialFieldKey, number | null>();
  const bilanPassif = new Map<FinancialFieldKey, number | null>();
  const cdr = new Map<FinancialFieldKey, number | null>();

  for (const line of visualLines) {
    const { label, values } = splitLabelAndValues(line.text);
    if (!label || values.length === 0) continue;
    const normalizedLabel = normalizeLabelForMatching(label);

    // First-come first-served : chaque champ est assigné une seule fois.
    const actifField = matchFusalpBilanActifLabel(normalizedLabel);
    if (actifField) {
      if (!bilanActif.has(actifField)) {
        bilanActif.set(actifField, selectActifValue(values));
      }
      continue;
    }

    const passifField = matchFusalpBilanPassifLabel(normalizedLabel);
    if (passifField) {
      if (!bilanPassif.has(passifField)) {
        bilanPassif.set(passifField, selectPassifValue(values));
      }
      continue;
    }

    const cdrField = matchFusalpCdrLabel(normalizedLabel);
    if (cdrField) {
      if (!cdr.has(cdrField)) {
        cdr.set(cdrField, selectCdrTriColumnValue(values));
      }
      continue;
    }
  }

  return { bilanActif, bilanPassif, cdr };
}

function normalizeLabelForMatching(label: string): string {
  return label
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s*\(\s*/g, " (")
    .replace(/\s*\)\s*/g, ")")
    .replace(/\s+/g, " ")
    .trim();
}

function selectActifValue(values: readonly number[]): number | null {
  // Bilan actif 4 colonnes : Brut | Amort | Net N | Net N-1
  const n = values.length;
  if (n >= 4) return values[2] ?? null;
  if (n === 3) return values[1] ?? null;
  if (n === 2) return values[0] ?? null;
  if (n === 1) return values[0] ?? null;
  return null;
}

function selectPassifValue(values: readonly number[]): number | null {
  // Bilan passif 2 colonnes : N | N-1 → index 0.
  return values.length > 0 ? (values[0] ?? null) : null;
}

function selectCdrTriColumnValue(values: readonly number[]): number | null {
  // CDR Fiducial 3 colonnes : France | Export | Total N (+ Total N-1)
  // Règles :
  //   3+ candidats → index 2 (Total N)
  //   2 candidats  → somme si ratio ∈ [0.05, 0.65] (France+Export), sinon index 0
  //   1 candidat   → index 0
  const n = values.length;
  if (n === 0) return null;
  if (n === 1) return values[0] ?? null;
  if (n >= 3) return values[2] ?? null;

  // n === 2 : ambigu [France, Export] ou [N, N-1]
  const a = values[0] ?? 0;
  const b = values[1] ?? 0;
  if (a <= 0 || b <= 0) return values[0] ?? null;
  const larger = Math.max(a, b);
  const smaller = Math.min(a, b);
  const ratio = smaller / larger;
  if (ratio >= CDR_RATIO_MIN && ratio <= CDR_RATIO_MAX) {
    return a + b;
  }
  return values[0] ?? null;
}

function splitLabelAndValues(lineText: string): { label: string; values: number[] } {
  // Extraction des nombres au format français : 1 à 3 chiffres suivis
  // éventuellement de groupes d'exactement 3 chiffres séparés par un espace
  // (ASCII, NBSP U+00A0, ou fine U+202F). Exemples valides :
  //   "40 803 214", "1 501 392", "86 066", "417".
  // Le quantifieur {3} est crucial : sans ça, "40 803 214 11 116 725" serait
  // capturé comme un seul nombre. Avec {3}, après "214" on cherche "\s\d{3}" ;
  // " 11" matche "\s" mais "11" n'est pas 3 chiffres → le match stoppe à "214"
  // et le suivant commence à "11 116 725". Permet de séparer N colonnes CDR
  // même quand le column gap detection n'a pas inséré de séparateur "|".
  const numberPattern = /\d{1,3}(?:[\s\u00A0\u202F]\d{3})*/g;
  const matches = [...lineText.matchAll(numberPattern)];

  const values: number[] = [];
  let firstValueIndex = lineText.length;
  for (const m of matches) {
    const raw = m[0].replace(/[\s\u00A0\u202F]/g, "");
    const num = parseInt(raw, 10);
    if (!Number.isNaN(num) && num >= 100) {
      values.push(num);
      if ((m.index ?? lineText.length) < firstValueIndex) {
        firstValueIndex = m.index ?? lineText.length;
      }
    }
  }

  // Label = tout le texte avant la première valeur ≥ 100, nettoyé des
  // séparateurs de colonnes résiduels "|".
  const label = lineText.slice(0, firstValueIndex).replace(/\|/g, " ").trim();

  return { label, values };
}
