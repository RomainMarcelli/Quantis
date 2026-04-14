export type DocumentFormat = "2033-sd" | "dgfip-2050" | "sage" | "unknown";

// ---- DGFiP 2050 ----
//
// Titre explicite "DGFiP N° 2050/2051/2052/2053" — signal le plus fort.
// Tolère les variantes OCR : espaces, "N°" vs "N", casse.
const FORMAT_2050_TITLE_PATTERN = /DGFiP\s*N[°o]?\s*205\d\b/i;

// Marqueur fournisseur edi-tdfc (présent uniquement sur les formulaires DGFiP officiels).
const FORMAT_2050_EDI_PATTERN = /edi[\s-]?tdfc/i;

// Codes alphabétiques caractéristiques du 2050 : AA (capital non appelé), BJ (total II
// actif), FA (ventes de marchandises), FJ (chiffres d'affaires nets), DL (total I passif),
// HN (bénéfice). La présence simultanée de 3+ de ces codes est un signal robuste.
const FORMAT_2050_ALPHA_CODE_TOKENS = ["AA", "BJ", "FA", "FJ", "DL", "HN"] as const;

// ---- Sage (logiciel comptable) ----
//
// Signaux robustes observés sur TROIS V (Lot 7A) :
//   1. "© Sage" en pied de page (présent sur toutes les pages exportées par Sage)
//   2. "Compte de Résultat (Première Partie)" — titre de section spécifique au template Sage
//   3. "TOTAL immobilisations incorporelles" — libellé de sous-total bilan Sage
//
// La combinaison est plus robuste que chaque marqueur isolé : "Sage" seul pourrait
// apparaître dans un narratif commercial ; "Compte de Résultat" seul est générique ;
// "TOTAL immobilisations" seul pourrait apparaître dans d'autres exports comptables.
// On exige **au moins 2 signaux sur 3** pour confirmer Sage.
const FORMAT_SAGE_COPYRIGHT_PATTERN = /©\s*Sage/i;
const FORMAT_SAGE_CDR_TITLE_PATTERN = /Compte de R[ée]sultat \(Premi[èe]re Partie\)/i;
const FORMAT_SAGE_IMMOB_TOTAL_PATTERN = /TOTAL\s+immobilisations\s+incorporelles/i;

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

  if (countSageSignals(rawText) >= 2) {
    return "sage";
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

function countSageSignals(rawText: string): number {
  let count = 0;
  if (FORMAT_SAGE_COPYRIGHT_PATTERN.test(rawText)) count += 1;
  if (FORMAT_SAGE_CDR_TITLE_PATTERN.test(rawText)) count += 1;
  if (FORMAT_SAGE_IMMOB_TOTAL_PATTERN.test(rawText)) count += 1;
  return count;
}
