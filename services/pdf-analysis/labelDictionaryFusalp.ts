import type { FinancialFieldKey } from "@/services/pdf-analysis/types";

// Dictionnaires de libellés pour les liasses fiscales Fiducial Audit (ex : Fusalp).
//
// Caractéristiques du layout :
//   - Bilan actif : 4 colonnes (Montant brut | Amort. Prov. | Net 31/05/YYYY | Net 31/05/YYYY-1)
//     → valeur cible = Net 31/05/YYYY (index 2 sur 4 candidats)
//   - Bilan passif : 2 colonnes (Exercice YYYY | Exercice YYYY-1) → index 0
//   - CDR        : 3 colonnes (France | UE+Export | Total YYYY) + Total YYYY-1
//     → valeur cible = Total YYYY (index 2 sur 3+ candidats)
//       Cas où pdf-parse/OCR ne récupère que 2 candidats [France, Export] :
//       reconstituer Total = France + Export si ratio smaller/larger ∈ [0.05, 0.65]
//
// Les labels Fiducial sont imprimés en mixte (majuscules pour les totaux de
// section, casse normale pour les détails). Patterns ancrés (^...$) pour
// éviter les faux matches sur du texte narratif ou des annexes.

type FiducialLabelEntry = {
  pattern: RegExp;
  field: FinancialFieldKey;
};

// ---- CDR Fiducial (3 colonnes France | Export | Total) ----
//
// Labels CDR observés sur Fusalp 2025 :
//   "Ventes de marchandises"
//   "CHIFFRES D'AFFAIRES NETS"
//   "Salaires et traitements"
//   "Charges sociales"
//   "Sur immobilisations : dotations aux amortissements"  (détail des dotations)
//   "CHARGES D'EXPLOITATION"
//   "BENEFICE OU PERTE"
//
// Les apostrophes alternatives (U+0027 vs U+2019) sont tolérées via la classe [''].
// Les accents majuscules sont optionnels (BENEFICE/BÉNÉFICE, RESULTAT/RÉSULTAT).
export const FUSALP_CDR_LABELS: readonly FiducialLabelEntry[] = [
  // Produits d'exploitation
  { pattern: /^Ventes de marchandises$/i, field: "salesGoods" },
  {
    pattern: /^CHIFFRES D['']AFFAIRES NETS$/i,
    field: "netTurnover"
  },

  // Charges d'exploitation détail
  { pattern: /^Autres achats et charges externes/i, field: "externalCharges" },
  { pattern: /^Salaires et traitements$/i, field: "wages" },
  { pattern: /^Charges sociales$/i, field: "socialCharges" },
  // Ligne spécifique Fiducial pour la dotation aux amortissements :
  // "Sur immobilisations : dotations aux amortissements" (avec ou sans deux-points)
  {
    pattern: /^Sur immobilisations\s*:?\s*dotations aux amortissements$/i,
    field: "depreciationAllocations"
  },

  // Totaux et résultat
  {
    pattern: /^PRODUITS D['']EXPLOITATION$/i,
    field: "totalOperatingProducts"
  },
  {
    pattern: /^CHARGES D['']EXPLOITATION$/i,
    field: "totalOperatingCharges"
  },
  { pattern: /^B[ÉE]N[ÉE]FICE OU PERTE$/i, field: "netResult" }
];

export function matchFusalpCdrLabel(line: string): FinancialFieldKey | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  for (const entry of FUSALP_CDR_LABELS) {
    if (entry.pattern.test(trimmed)) return entry.field;
  }
  return null;
}

// ---- Bilan Actif Fiducial (4 colonnes Brut | Amort | Net N | Net N-1) ----
//
// Labels observés sur Fusalp page 3 :
//   "Marchandises"
//   "Créances clients et comptes rattachés"
//   "Disponibilités"
//   "ACTIF IMMOBILISE"
//   "ACTIF CIRCULANT"
//   "TOTAL GENERAL"  (apparaît aussi sur le bilan passif, handled via first-come first-served)
//
// Les totaux (ACTIF IMMOBILISE / ACTIF CIRCULANT / TOTAL GENERAL) sont publiés
// sur 4 colonnes Brut | Amort | Net N | Net N-1 exactement comme les détails ;
// selectActifValue sélectionne index 2 = Net N.
export const FUSALP_BILAN_ACTIF_LABELS: readonly FiducialLabelEntry[] = [
  // Stocks / créances / disponibilités
  { pattern: /^Marchandises$/i, field: "inventoriesGoods" },
  {
    pattern: /^Cr[ée]ances clients et comptes rattach[ée]s$/i,
    field: "tradeReceivables"
  },
  { pattern: /^Disponibilit[ée]s$/i, field: "cashAndCashEquivalents" },

  // Totaux
  { pattern: /^ACTIF IMMOBILIS[ÉE]/i, field: "totalFixedAssets" },
  { pattern: /^ACTIF CIRCULANT$/i, field: "totalCurrentAssets" },
  { pattern: /^TOTAL GENERAL$/i, field: "totalAssets" }
];

export function matchFusalpBilanActifLabel(line: string): FinancialFieldKey | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  for (const entry of FUSALP_BILAN_ACTIF_LABELS) {
    if (entry.pattern.test(trimmed)) return entry.field;
  }
  return null;
}

// ---- Bilan Passif Fiducial (2 colonnes Exercice N | Exercice N-1) ----
//
// Labels observés sur Fusalp page 4 :
//   "CAPITAUX PROPRES"
//   "Dettes fournisseurs et comptes rattachés"
//   "Dettes fiscales et sociales"
//   "DETTES"  (total de la section, distinct de "Dettes fournisseurs"/"Dettes fiscales")
export const FUSALP_BILAN_PASSIF_LABELS: readonly FiducialLabelEntry[] = [
  { pattern: /^CAPITAUX PROPRES$/i, field: "equity" },
  {
    pattern: /^Dettes fournisseurs et comptes rattach[ée]s$/i,
    field: "tradePayables"
  },
  { pattern: /^Dettes fiscales et sociales$/i, field: "taxSocialPayables" },
  { pattern: /^DETTES$/i, field: "debts" }
];

export function matchFusalpBilanPassifLabel(line: string): FinancialFieldKey | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  for (const entry of FUSALP_BILAN_PASSIF_LABELS) {
    if (entry.pattern.test(trimmed)) return entry.field;
  }
  return null;
}
