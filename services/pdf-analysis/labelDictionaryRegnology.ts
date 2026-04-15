import type { FinancialFieldKey } from "@/services/pdf-analysis/types";

// Dictionnaires de libellés pour les liasses fiscales exportées via Regnology.
//
// Caractéristiques :
//   - Bilan actif : 4 colonnes (Brut | Amort/Dépréciations | Net N | Net N-1)
//     → la valeur à extraire est toujours la colonne Net N (index 2 sur 4 candidats).
//   - Bilan passif : 2 colonnes (N | N-1) → index 0.
//   - CDR : 2 colonnes (N | N-1) → index 0.
//
// Les labels imprimés par Regnology diffèrent systématiquement de ceux du
// 2033-SD (singulier vs pluriel, majuscules sans accents, tirets de puce,
// etc.). Ce dictionnaire capture uniquement les labels effectivement observés
// sur le PDF RIP CURL EUROPE — tout ce qui n'est pas listé restera à null.
//
// Règle de portée : chaque section (CDR / actif / passif) a son propre
// matcher. Le walker côté rowReconstructionRegnology.ts scope les rows par
// section avant de les passer au bon matcher, évitant que "Dettes fiscales
// et sociales" du passif ne soit confondu avec une hypothétique ligne CDR.

type RegnologyLabelEntry = {
  pattern: RegExp;
  field: FinancialFieldKey;
};

// ---- CDR Regnology (2 colonnes : N | N-1) ----
//
// Tous les labels sont ancrés (^...$) sur la ligne complète. Les apostrophes
// alternatives (U+0027 vs U+2019) sont tolérées via la classe ['']. Les
// accents majuscules sont optionnels (BENEFICE/BÉNÉFICE, IMMOBILISE/IMMOBILISÉ).
export const REGNOLOGY_CDR_LABELS: readonly RegnologyLabelEntry[] = [
  // Produits d'exploitation — singulier (Regnology) + pluriel (2033-sd variant)
  { pattern: /^Vente[s]? de marchandises/i, field: "salesGoods" },
  { pattern: /^Production vendue/i, field: "productionSold" },
  {
    pattern: /^Montant net du chiffre d['']affaires/i,
    field: "netTurnover"
  },

  // Charges d'exploitation
  { pattern: /^Autres achats et charges externes/i, field: "externalCharges" },
  { pattern: /^Salaires$/i, field: "wages" },
  { pattern: /^Cotisations sociales$/i, field: "socialCharges" },
  // dap : la ligne est souvent imprimée avec un tiret de puce initial et un
  // tiret séparateur interne. Regex tolérante sur les 3 variantes de dash
  // (U+002D, U+2013, U+2014) et le whitespace.
  {
    pattern: /^\s*[-–—]?\s*Sur immobilisations\s*[-–—]\s*dotations aux amortissements/i,
    field: "depreciationAllocations"
  },
  {
    pattern: /^TOTAL DES CHARGES D['']EXPLOITATION/i,
    field: "totalOperatingCharges"
  },

  // Résultat exceptionnel (détail)
  // Pas de $ final sur Produits exceptionnels → tolère les suffixes " (VII)"
  // Charges exceptionnelles : negative lookahead (?!\s*,) pour exclure
  // "Charges exceptionnelles , dont :" (ligne d'annexe) tout en tolérant
  // le suffixe " (VIII)" de la ligne totalisatrice du CDR.
  { pattern: /^Produits exceptionnels/i, field: "exceptionalProducts" },
  { pattern: /^Charges exceptionnelles(?!\s*,)/i, field: "exceptionalCharges" },

  // Résultat net final (ancre bas de CDR)
  { pattern: /^B[ÉE]N[ÉE]FICE OU PERTE$/i, field: "netResult" }
];

export function matchRegnologyCdrLabel(line: string): FinancialFieldKey | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  for (const entry of REGNOLOGY_CDR_LABELS) {
    if (entry.pattern.test(trimmed)) return entry.field;
  }
  return null;
}

// ---- Bilan Actif Regnology (4 colonnes : Brut | Amort | Net N | Net N-1) ----
//
// Seuls les labels des totaux et des rows détail ciblés sont listés. Les
// rows intermédiaires (ex: "Immobilisations incorporelles" subtotal) ne
// sont pas extraites — on ne prend que les targets explicites.
export const REGNOLOGY_BILAN_ACTIF_LABELS: readonly RegnologyLabelEntry[] = [
  // Stocks / créances / disponibilités
  { pattern: /^Marchandises$/i, field: "inventoriesGoods" },
  {
    pattern: /^Cr[ée]ances clients et comptes rattach[ée]s$/i,
    field: "tradeReceivables"
  },
  { pattern: /^Autres cr[ée]ances$/i, field: "otherReceivables" },
  { pattern: /^Disponibilit[ée]s$/i, field: "cashAndCashEquivalents" },

  // Totaux — pas de $ pour tolérer les suffixes " (III)", " (IV)",
  // " (I + II + III + IV + V + VI + VII)" etc.
  { pattern: /^TOTAL ACTIF IMMOBILIS[ÉE]/i, field: "totalFixedAssets" },
  { pattern: /^TOTAL ACTIF CIRCULANT/i, field: "totalCurrentAssets" },
  {
    pattern: /^TOTAL G[ÉE]N[ÉE]RAL DE L['']\s*ACTIF/i,
    field: "totalAssets"
  }
];

export function matchRegnologyBilanActifLabel(line: string): FinancialFieldKey | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  for (const entry of REGNOLOGY_BILAN_ACTIF_LABELS) {
    if (entry.pattern.test(trimmed)) return entry.field;
  }
  return null;
}

// ---- Bilan Passif Regnology (2 colonnes : N | N-1) ----
//
// Les targets capitaux propres détail (shareCapital/legalReserves/retainedEarnings)
// ne sont pas dans la spec RIP CURL → seul le total "equity" est capturé.
export const REGNOLOGY_BILAN_PASSIF_LABELS: readonly RegnologyLabelEntry[] = [
  // Totaux — pas de $ pour tolérer les suffixes " (I)", " (III)", etc.
  { pattern: /^TOTAL DES CAPITAUX PROPRES/i, field: "equity" },
  { pattern: /^TOTAL DES DETTES/i, field: "debts" },
  {
    pattern: /^Dettes fournisseurs et comptes rattach[ée]s$/i,
    field: "tradePayables"
  },
  { pattern: /^Dettes fiscales et sociales$/i, field: "taxSocialPayables" }
];

export function matchRegnologyBilanPassifLabel(line: string): FinancialFieldKey | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  for (const entry of REGNOLOGY_BILAN_PASSIF_LABELS) {
    if (entry.pattern.test(trimmed)) return entry.field;
  }
  return null;
}
