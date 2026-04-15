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
  /chiffre\s+d['']\s*affaires/i,
  // Markers additionnels format Fusalp (Fiducial Audit)
  /BILAN\s+AU\b/i,
  /COMPTE\s+DE\s+RESULTAT\s+AU\b/i,
  /CHIFFRES?\s+D['']\s*AFFAIRES?\s+NETS?/i,
  /ACTIF\s+IMMOBILIS[ÉE]/i,
  /CAPITAUX\s+PROPRES/i,
  /CHARGES\s+D['']\s*EXPLOITATION/i
];

const NEGATIVE_MARKERS: readonly RegExp[] = [
  /rapport\s+du\s+commissaire\s+aux\s+comptes/i,
  /tableau\s+de\s+variation\s+des\s+capitaux\s+propres/i,
  /r[ée]partition\s+des\s+effectifs/i,
  /filiales\s+et\s+participations/i,
  /engagements\s+hors\s+bilan/i,
  // Exclusions format Fusalp : procès-verbal AG + résolutions
  /proc[èe]s[-\s]*verbal/i,
  /approbation\s+des\s+comptes\s+sociaux/i,
  /assembl[ée]e\s+g[ée]n[ée]rale\s+ordinaire/i
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

// Limite hard en fallback scan : Document AI imageless autorise 30 pages max.
// On en laisse 30 pour couvrir bilan + CDR + annexes clés sans dépasser la limite.
const FALLBACK_MAX_PAGES = 30;

function isDocusignScanOnly(pageTexts: readonly string[]): boolean {
  if (pageTexts.length === 0) return false;
  const uninformative = pageTexts.filter((text) => {
    const trimmed = text.trim();
    return trimmed === "" || /^Docusign Envelope ID/i.test(trimmed);
  }).length;
  return uninformative > pageTexts.length * 0.5;
}

async function buildReducedPdf(
  pdfBuffer: Buffer,
  pageIndices: readonly number[]
): Promise<Buffer> {
  const srcDoc = await PDFDocument.load(pdfBuffer);
  const newDoc = await PDFDocument.create();
  const copied = await newDoc.copyPages(srcDoc, [...pageIndices]);
  for (const page of copied) {
    newDoc.addPage(page);
  }
  const outBytes = await newDoc.save();
  return Buffer.from(outBytes);
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
      // Aucun marqueur textuel trouvé — typiquement un PDF scanné Docusign où
      // pdf-parse ne voit que "Docusign Envelope ID" sur chaque page. Dans ce
      // cas on envoie quand même les N premières pages à Document AI, qui fera
      // son propre OCR sur les images. On ne peut pas rejeter le PDF entier.
      const fallbackCount = Math.min(originalPages, FALLBACK_MAX_PAGES);
      if (fallbackCount === 0) {
        console.warn(
          "[pdfPageExtractor] PDF vide, fallback impossible, retour du buffer original."
        );
        return { buffer: pdfBuffer, originalPages, extractedPages: originalPages };
      }
      const scanDetected = isDocusignScanOnly(pageTexts);
      console.warn(
        `[pdfPageExtractor] Aucune page financière détectée${scanDetected ? " (scan Docusign)" : ""}, fallback pages 1-${fallbackCount}`
      );
      const fallbackIndices = Array.from({ length: fallbackCount }, (_, i) => i);
      const fallbackBuffer = await buildReducedPdf(pdfBuffer, fallbackIndices);
      return {
        buffer: fallbackBuffer,
        originalPages,
        extractedPages: fallbackCount
      };
    }

    const extractedPages = keepIndices.length;
    const reducedBuffer = await buildReducedPdf(pdfBuffer, keepIndices);

    console.info(
      `[pdfPageExtractor] PDF réduit de ${originalPages} pages à ${extractedPages} pages (pages financières)`
    );
    if (extractedPages > 28) {
      console.warn(
        `[pdfPageExtractor] PDF financier encore trop long (${extractedPages} pages), risque timeout Document AI`
      );
    }

    return {
      buffer: reducedBuffer,
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
