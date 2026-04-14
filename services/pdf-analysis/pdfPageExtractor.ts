import { PDFDocument } from "pdf-lib";
import { PDFParse } from "pdf-parse";

// Pré-traitement PDF : isole les pages "financièrement utiles" avant envoi
// à Document AI, qui est limité (~30 pages) et coûteux à appeler sur les
// annexes des rapports d'audit.
//
// Détection par marqueurs textuels extraits page par page via pdf-parse
// (compatible Node.js natif, bundle son propre pdfjs interne).
// Reconstruction du PDF filtré via pdf-lib (copyPages).

type ExtractFinancialPagesResult = {
  buffer: Buffer;
  originalPages: number;
  extractedPages: number;
};

type PageClassification = {
  kept: boolean;
  reason: string;
};

const POSITIVE_MARKERS: readonly RegExp[] = [
  /bilan\s*[—–-]?\s*actif/i,
  /bilan\s*[—–-]?\s*passif/i,
  /compte\s+de\s+r[ée]sultat/i,
  /r[ée]sultat\s+d['']\s*exploitation/i,
  /total\s+g[ée]n[ée]ral\s+de\s+l['']?\s*actif/i,
  /total\s+g[ée]n[ée]ral\s+du\s+passif/i,
  /total\s+des\s+produits/i,
  /total\s+des\s+charges/i,
  /DGFiP\s*N[°o]?\s*205[012]/i,
  /ventes\s+de\s+marchandises/i,
  /chiffre\s+d['']\s*affaires/i
];

const NEGATIVE_MARKERS: readonly RegExp[] = [
  /rapport\s+du\s+commissaire\s+aux\s+comptes/i,
  /tableau\s+de\s+variation\s+des\s+capitaux\s+propres/i,
  /r[ée]partition\s+des\s+effectifs/i,
  /filiales\s+et\s+participations/i,
  /engagements\s+hors\s+bilan/i
];

const CODE_2033_TOKENS: readonly string[] = [
  "209",
  "232",
  "264",
  "310",
  "044",
  "096",
  "142",
  "176"
];

export function classifyPage(pageText: string): PageClassification {
  if (!pageText || pageText.trim().length === 0) {
    return { kept: false, reason: "page vide" };
  }

  let positiveReason: string | null = null;
  for (const pattern of POSITIVE_MARKERS) {
    const match = pageText.match(pattern);
    if (match) {
      positiveReason = match[0].toLowerCase();
      break;
    }
  }
  if (!positiveReason && countDistinct2033Codes(pageText) >= 3) {
    positiveReason = "3+ codes 2033-SD";
  }
  if (!positiveReason) {
    return { kept: false, reason: "aucun marqueur positif" };
  }

  for (const pattern of NEGATIVE_MARKERS) {
    const match = pageText.match(pattern);
    if (match) {
      return { kept: false, reason: match[0].toLowerCase() };
    }
  }
  if (/opinion/i.test(pageText) && /audit/i.test(pageText)) {
    return { kept: false, reason: "opinion + audit" };
  }

  return { kept: true, reason: positiveReason };
}

export function isFinanciallyUsefulPage(pageText: string): boolean {
  return classifyPage(pageText).kept;
}

function countDistinct2033Codes(text: string): number {
  let count = 0;
  for (const token of CODE_2033_TOKENS) {
    const pattern = new RegExp(`(^|[^0-9])${token}([^0-9]|$)`);
    if (pattern.test(text)) count += 1;
    if (count >= 3) return count;
  }
  return count;
}

async function extractAllPageTexts(pdfBuffer: Buffer): Promise<string[]> {
  const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
  try {
    const result = await parser.getText();
    return result.pages.map((page) => page.text.replace(/\s+/g, " ").trim());
  } finally {
    await parser.destroy();
  }
}

export async function extractFinancialPages(
  pdfBuffer: Buffer
): Promise<ExtractFinancialPagesResult> {
  let originalPages = 0;
  try {
    const pageTexts = await extractAllPageTexts(pdfBuffer);
    originalPages = pageTexts.length;

    const verbose = process.env.PDF_EXTRACTOR_VERBOSE === "true";
    const keepIndices: number[] = [];
    for (let i = 0; i < pageTexts.length; i += 1) {
      const text = pageTexts[i];
      const classification = classifyPage(text);
      if (classification.kept) keepIndices.push(i);
      if (verbose) {
        const status = classification.kept ? "KEPT   " : "SKIPPED";
        const snippet = text.slice(0, 120);
        console.info(
          `[pdfPageExtractor] Page ${i + 1}/${pageTexts.length}: ${status} | raison: "${classification.reason}"\n    > "${snippet}"`
        );
      }
    }

    if (keepIndices.length === 0) {
      console.warn(
        "[pdfPageExtractor] Aucune page financière détectée, fallback sur le PDF original."
      );
      return {
        buffer: pdfBuffer,
        originalPages,
        extractedPages: originalPages
      };
    }

    const srcDoc = await PDFDocument.load(pdfBuffer);
    const newDoc = await PDFDocument.create();
    const copied = await newDoc.copyPages(srcDoc, keepIndices);
    for (const page of copied) {
      newDoc.addPage(page);
    }

    const outBytes = await newDoc.save();
    const extractedPages = keepIndices.length;

    console.info(
      `[pdfPageExtractor] PDF réduit de ${originalPages} pages à ${extractedPages} pages (pages financières)`
    );
    if (extractedPages > 28) {
      console.warn(
        `[pdfPageExtractor] PDF financier encore trop long (${extractedPages} pages), risque timeout Document AI`
      );
    }

    return {
      buffer: Buffer.from(outBytes),
      originalPages,
      extractedPages
    };
  } catch (error) {
    console.error(
      "[pdfPageExtractor] Extraction échouée, fallback sur le PDF original.",
      error instanceof Error ? error.message : error
    );
    return {
      buffer: pdfBuffer,
      originalPages,
      extractedPages: originalPages
    };
  }
}
