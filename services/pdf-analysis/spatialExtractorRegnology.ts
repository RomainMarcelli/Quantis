import {
  matchRegnologyBilanActifLabel,
  matchRegnologyBilanPassifLabel,
  matchRegnologyCdrLabel
} from "@/services/pdf-analysis/labelDictionaryRegnology";
import type { DocumentAIResponse, FinancialFieldKey } from "@/services/pdf-analysis/types";

// Extracteur spatial pour les liasses Regnology.
//
// Document AI retourne les tokens avec orientation PAGE_LEFT (bilan) ou PAGE_UP
// (CDR). L'algorithme reconstitue les "lignes visuelles" du PDF en exploitant
// les coordonnées normalisées de chaque token, de sorte que les extracteurs
// downstream puissent raisonner sur des lignes label + valeurs adjacentes
// au lieu d'un rawText column-major inexploitable.
//
// Règles :
//   - PAGE_UP   : texte normal, lignes = tokens de même Y (±tolérance),
//                 tokens triés par X croissant au sein d'une ligne.
//   - PAGE_LEFT : texte rotation 90° CCW, lignes = tokens de même X
//                 (±tolérance), tokens triés par Y décroissant au sein d'une
//                 ligne (le "début" de la ligne du lecteur est en bas du PDF
//                 physique, le "fin" en haut).
//   - OTHER     : traité comme PAGE_UP par défaut.
//
// Scope page : on ne traite que les pages dont pageNumber est dans [1, 4].
// Les pages suivantes sont les annexes / notes détail qui dupliquent les
// chiffres du bilan et polluent le first-come-first-served.

const GROUP_TOLERANCE = 0.005;
const COLUMN_GAP_THRESHOLD = 0.04;
const MAX_PAGE_NUMBER = 4;

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

export function buildRegnologyVisualLines(document: DocumentAIResponse): VisualLine[] {
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
    // PAGE_LEFT : début de ligne en bas du PDF physique (Y max) → Y décroissant
    return [...tokens].sort((a, b) => b.y - a.y);
  }
  // PAGE_UP / OTHER : gauche à droite → X croissant
  return [...tokens].sort((a, b) => a.x - b.x);
}

function buildVisualLine(
  ordered: readonly ResolvedToken[],
  orientation: VisualLineOrientation,
  pageNumber: number
): VisualLine {
  const tokens = ordered.map((t) => t.text);
  // Reconstruction du texte avec séparateurs de colonnes :
  // on compare le gap entre chaque paire consécutive de tokens sur l'axe
  // de lecture. Si gap > COLUMN_GAP_THRESHOLD, on insère "|" au lieu d'un
  // espace — splitLabelAndValues s'appuie sur ce séparateur pour isoler
  // les valeurs de différentes colonnes sans ambiguïté.
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
    // Ordre de lecture Y décroissant → prev a le Y le plus haut, curr le Y
    // le plus bas. Gap = prev.minY - curr.maxY.
    return prev.minY - curr.maxY;
  }
  // PAGE_UP / OTHER : lecture X croissante → gap = curr.minX - prev.maxX.
  return curr.minX - prev.maxX;
}

// ---- Extraction des valeurs financières depuis les lignes visuelles ----
//
// Principe : chaque ligne visuelle reconstituée ressemble à
// "Label valeur1 valeur2 valeur3 valeur4" avec les valeurs en queue de ligne.
// On sépare label/valeurs en scannant de droite à gauche les tokens
// numériques, puis on matche le label contre les 3 dictionnaires Regnology
// (actif, passif, CDR) pour décider de la section + champ cible.
//
// Règle de sélection de colonne :
//   - Bilan actif : 4 valeurs → Brut | Amort | Net N | Net N-1 → index 2
//                   3 valeurs → Brut | Net N | Net N-1          → index 1
//                   2 valeurs → Net N | Net N-1                 → index 0
//                   1 valeur  → Net N                           → index 0
//   - Bilan passif : 2 valeurs → N | N-1                        → index 0
//                    1 valeur  → N                              → index 0
//   - CDR          : 2 valeurs → N | N-1                        → index 0
//                    1 valeur  → N                              → index 0
//
// First-come-first-served : la première ligne visuelle qui match un field
// gagne. Les occurrences suivantes (p.ex. dans les annexes) sont ignorées.
export type RegnologyExtractionResult = {
  bilanActif: Map<FinancialFieldKey, number | null>;
  bilanPassif: Map<FinancialFieldKey, number | null>;
  cdr: Map<FinancialFieldKey, number | null>;
};

export function extractRegnologyValuesFromVisualLines(
  visualLines: readonly VisualLine[]
): RegnologyExtractionResult {
  const bilanActif = new Map<FinancialFieldKey, number | null>();
  const bilanPassif = new Map<FinancialFieldKey, number | null>();
  const cdr = new Map<FinancialFieldKey, number | null>();

  for (const line of visualLines) {
    const { label, values } = splitLabelAndValues(line.text);
    if (!label || values.length === 0) continue;
    const normalizedLabel = normalizeLabelForMatching(label);

    const actifField = matchRegnologyBilanActifLabel(normalizedLabel);
    if (actifField) {
      if (!bilanActif.has(actifField)) {
        bilanActif.set(actifField, selectActifValue(values));
      }
      continue;
    }

    const passifField = matchRegnologyBilanPassifLabel(normalizedLabel);
    if (passifField) {
      if (!bilanPassif.has(passifField)) {
        bilanPassif.set(passifField, selectFirstColumnValue(values));
      }
      continue;
    }

    const cdrField = matchRegnologyCdrLabel(normalizedLabel);
    if (cdrField) {
      if (!cdr.has(cdrField)) {
        cdr.set(cdrField, selectFirstColumnValue(values));
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
  const n = values.length;
  if (n >= 4) return values[2] ?? null;
  if (n === 3) return values[1] ?? null;
  if (n === 2) return values[0] ?? null;
  if (n === 1) return values[0] ?? null;
  return null;
}

function selectFirstColumnValue(values: readonly number[]): number | null {
  return values.length > 0 ? (values[0] ?? null) : null;
}

function splitLabelAndValues(lineText: string): { label: string; values: number[] } {
  const parts = lineText
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return { label: lineText.trim(), values: [] };

  // Le label est la première partie, nettoyée des éventuels chiffres
  // résiduels (cas où label + 1re valeur se retrouvent collés sans gap).
  const label = parts[0].replace(/\d[\d\s]*/g, "").trim();

  const values: number[] = [];
  for (const part of parts) {
    const cleaned = part.replace(/\s/g, "");
    const num = parseInt(cleaned, 10);
    if (!Number.isNaN(num) && num >= 100) values.push(num);
  }
  return { label, values };
}
