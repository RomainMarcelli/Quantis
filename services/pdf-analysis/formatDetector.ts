export type DocumentFormat = "2033-sd" | "dgfip-2050" | "unknown";

// Titre explicite "DGFiP N° 2050/2051/2052/2053" — signal le plus fort.
// Tolère les variantes OCR : espaces, "N°" vs "N", casse.
const FORMAT_2050_TITLE_PATTERN = /DGFiP\s*N[°o]?\s*205\d\b/i;

// Marqueur fournisseur edi-tdfc (présent uniquement sur les formulaires DGFiP officiels).
const FORMAT_2050_EDI_PATTERN = /edi[\s-]?tdfc/i;

// Codes alphabétiques caractéristiques du 2050 : AA (capital non appelé), BJ (total II
// actif), FA (ventes de marchandises), FJ (chiffres d'affaires nets), DL (total I passif),
// HN (bénéfice). La présence simultanée de 3+ de ces codes est un signal robuste.
const FORMAT_2050_ALPHA_CODE_TOKENS = ["AA", "BJ", "FA", "FJ", "DL", "HN"] as const;

export function detectDocumentFormat(rawText: string): DocumentFormat {
  if (!rawText || rawText.trim().length === 0) {
    return "unknown";
  }

  if (FORMAT_2050_TITLE_PATTERN.test(rawText)) {
    return "dgfip-2050";
  }

  if (FORMAT_2050_EDI_PATTERN.test(rawText)) {
    return "dgfip-2050";
  }

  const distinctAlphaCodes = countDistinctAlphaCodes(rawText);
  if (distinctAlphaCodes >= 3) {
    return "dgfip-2050";
  }

  return "2033-sd";
}

function countDistinctAlphaCodes(rawText: string): number {
  let count = 0;
  for (const token of FORMAT_2050_ALPHA_CODE_TOKENS) {
    const pattern = new RegExp(`\\b${token}\\b`);
    if (pattern.test(rawText)) {
      count += 1;
    }
  }
  return count;
}
