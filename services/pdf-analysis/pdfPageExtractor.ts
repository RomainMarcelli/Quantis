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
  isScanned: boolean;
  imagelessMode: boolean;
};

type PageClassification = {
  kept: boolean;
  reason: string;
};

// Marqueurs fiscaux haute priorité : si l'un est trouvé, la page est incluse
// même si un marqueur négatif (plaquette cabinet, annexe) est aussi présent.
const FISCAL_PRIORITY_MARKERS: RegExp[] = [
  /DGFiP\s*N[°o°]?/i,
  /DGFIP\s*N[°o°]?/i,
  /205[0-5]-SD/i,
  /BILAN\s*[—–-]\s*ACTIF/i,
  /BILAN\s*[—–-]\s*PASSIF/i,
  /COMPTE DE RÉSULTAT DE L'EXERCICE/i,
  /Formulaire\s+obligatoire/i,
  /N[°o°]\s*15949/i
];

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
  /CHARGES\s+D['']\s*EXPLOITATION/i,
  /BALANCE\s+SHEET/i,
  /INCOME\s+STATEMENT/i
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
  /assembl[ée]e\s+g[ée]n[ée]rale\s+ordinaire/i,
  // Exclusions plaquette cabinet (Acora, etc.) : pages de présentation qui
  // contiennent "Bilan" ou "Compte de résultat" dans un titre de sommaire
  // mais ne portent aucune donnée financière exploitable.
  /Plaquette\s+du\b/i,
  /VOTRE\s+EXPERT[—–-]?\s*COMPTABLE/i,
  /SOLDES\s+INTERMEDIAIRES\s+DE\s+GESTION/i,
  /COMPTES\s+ANNUELS\s+DETAILLES/i,
  /BILAN\s+ACTIF\s+DETAILLE/i,
  /BILAN\s+PASSIF\s+DETAILLE/i,
  /COMPTE\s+DE\s+RESULTAT\s+DETAILLE/i,
  /DOSSIER\s+DE\s+GESTION/i,
  /ANNEXE\s+COMPTABLE/i,
  /Mission de présentation des comptes/i,
  /SIG sur/i,
  /SIG détaillés/i,
  /Documents\s+à\s+produire\s+pour\s+le\s+dépôt/i,
  /OBSERVATIONS\s+TRES\s+IMPORTANTES/i,
  /comptes\s+annuels.*bilan.*compte\s+de\s+résultat.*annexe/i,
  /Dépréciation\s+Actif\s+Immobilis/i
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
    return { kept: false, reason: "empty" };
  }

  // PRIORITÉ ABSOLUE : marqueurs fiscaux DGFiP → toujours inclus
  for (const marker of FISCAL_PRIORITY_MARKERS) {
    if (marker.test(pageText)) {
      if (process.env.PDF_EXTRACTOR_VERBOSE === "true") {
        console.log(`[PDF-EXTRACTOR] fiscal priority marker found: "${marker.source}"`);
      }
      return { kept: true, reason: `fiscal_priority:${marker.source}` };
    }
  }

  // Marqueurs positifs standards → soumettre aux négatifs
  const hasPositive =
    POSITIVE_MARKERS.some((m) => m.test(pageText)) ||
    countDistinct2033Codes(pageText) >= 3;
  if (!hasPositive) {
    return { kept: false, reason: "no_positive_marker" };
  }

  // Marqueurs négatifs → exclure
  for (const marker of NEGATIVE_MARKERS) {
    if (marker.test(pageText)) {
      if (process.env.PDF_EXTRACTOR_VERBOSE === "true") {
        console.log(`[PDF-EXTRACTOR] excluded by negative marker: "${marker.source}"`);
      }
      return { kept: false, reason: `negative:${marker.source}` };
    }
  }
  if (/opinion/i.test(pageText) && /audit/i.test(pageText)) {
    return { kept: false, reason: "negative:opinion+audit" };
  }

  return { kept: true, reason: "positive_marker" };
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


export async function isFullyScannedPdf(pdfBuffer: Buffer): Promise<boolean> {
  try {
    const pageTexts = await extractAllPageTexts(pdfBuffer);
    if (pageTexts.length === 0) return false;
    const emptyCount = pageTexts.filter((t) => t.trim().length < 10).length;
    return emptyCount === pageTexts.length;
  } catch {
    return false;
  }
}

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

    // Détection scan pur : toutes les pages ont < 10 caractères de texte.
    const emptyPageCount = pageTexts.filter((t) => t.trim().length < 10).length;
    const fullyScanned = originalPages > 0 && emptyPageCount === originalPages;
    if (fullyScanned && verbose) {
      console.log(
        `[PDF-EXTRACTOR] PDF entièrement scanné détecté (${emptyPageCount} pages vides / ${originalPages} total)`
      );
    }

    // Fallback scan pur : ciblage intelligent + imagelessMode adapte.
    if (fullyScanned) {
      const scanResult = buildScanFallbackIndices(originalPages);
      const startPage = scanResult.indices[0] + 1;
      const endPage = scanResult.indices[scanResult.indices.length - 1] + 1;
      const modeLabel = scanResult.imagelessMode ? "imageless" : "OCR";
      console.warn(
        `[PDF-EXTRACTOR] Scan fallback: pages ${startPage} à ${endPage} sélectionnées (${scanResult.indices.length} pages ${modeLabel}), imagelessMode: ${scanResult.imagelessMode}`
      );
      if (scanResult.indices.length === originalPages) {
        return {
          buffer: pdfBuffer,
          originalPages,
          extractedPages: originalPages,
          isScanned: true,
          imagelessMode: scanResult.imagelessMode
        };
      }
      const scanBuffer = await buildReducedPdf(pdfBuffer, scanResult.indices);
      return {
        buffer: scanBuffer,
        originalPages,
        extractedPages: scanResult.indices.length,
        isScanned: true,
        imagelessMode: scanResult.imagelessMode
      };
    }

    // Chemin standard : classification page par page via marqueurs textuels.
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

    if (verbose && keepIndices.length > 0) {
      console.log(
        `[pdfPageExtractor] Pages sélectionnées : ${keepIndices.map((i) => i + 1).join(", ")} (${keepIndices.length}/${pageTexts.length})`
      );
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
        return {
          buffer: pdfBuffer,
          originalPages,
          extractedPages: originalPages,
          isScanned: false,
          imagelessMode: true
        };
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
        extractedPages: fallbackCount,
        isScanned: false,
        imagelessMode: true
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
      extractedPages,
      isScanned: false,
      imagelessMode: true
    };
  } catch (error) {
    console.error(
      "[pdfPageExtractor] Extraction échouée, fallback sur le PDF original.",
      error instanceof Error ? error.message : error
    );
    return {
      buffer: pdfBuffer,
      originalPages,
      extractedPages: originalPages,
      isScanned: false,
      imagelessMode: true
    };
  }
}

function buildScanFallbackIndices(totalPages: number): {
  indices: number[];
  imagelessMode: boolean;
} {
  const MAX_OCR = 15;
  const MAX_IMAGELESS = 30;

  if (totalPages <= MAX_IMAGELESS) {
    return {
      indices: Array.from({ length: totalPages }, (_, i) => i),
      imagelessMode: true
    };
  }

  if (totalPages <= 50) {
    const start = Math.max(0, Math.floor(totalPages * 0.2));
    const maxEnd = Math.min(totalPages, Math.floor(totalPages * 0.6));
    const count = Math.min(20, maxEnd - start);
    const end = start + count;
    return {
      indices: Array.from({ length: end - start }, (_, i) => start + i),
      imagelessMode: true
    };
  }

  // PDF long (>50 pages) : OCR complet sur 15 pages ciblees au milieu
  const start = Math.max(0, Math.floor(totalPages * 0.5));
  const end = Math.min(totalPages, start + MAX_OCR);
  return {
    indices: Array.from({ length: end - start }, (_, i) => start + i),
    imagelessMode: false
  };
}
