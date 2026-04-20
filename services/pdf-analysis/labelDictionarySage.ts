import type { FinancialFieldKey } from "@/services/pdf-analysis/types";

// Mapping des libellés CDR Sage (logiciel comptable) vers les champs financiers
// internes. Les regex sont ancrées (^...$) pour matcher les lignes complètes
// du rawText Document AI, où chaque libellé arrive sur sa propre ligne.
//
// Lot 7B — CDR uniquement. Le bilan Sage (actif/passif) viendra aux Lots 7C/7D.
//
// NOTE IMPORTANTE : certains libellés qui apparaîtraient légitimement ici
// sont VOLONTAIREMENT EXCLUS parce que leur position dans le rawText relève
// d'une émission column-major complexe qui pollue la fenêtre de capture du
// label précédent. À traiter dans un Lot 7B.2 dédié :
//   - "Intérêts et charges assimilées"        → financialCharges
//   - "PRODUITS FINANCIERS" / "PRODUITS EXCEPTIONNELS" (subtotaux section)
//   - "CHARGES FINANCIÈRES" / "CHARGES EXCEPTIONNELLES" (subtotaux section)
// Pour l'instant, ces champs restent à null (ou sont déduits via coalesce
// dans valueMapping).

type SageCdrLabel = {
  pattern: RegExp;
  field: FinancialFieldKey;
};

export const SAGE_CDR_LABELS: readonly SageCdrLabel[] = [
  // ---- Produits d'exploitation ----
  { pattern: /^Ventes de marchandises$/i, field: "salesGoods" },
  { pattern: /^Production vendue de biens$/i, field: "productionSoldGoods" },
  { pattern: /^Production vendue de services$/i, field: "productionSoldServices" },
  { pattern: /^Chiffres d'affaires nets$/i, field: "netTurnover" },
  { pattern: /^Production stock[ée]e$/i, field: "productionStored" },
  { pattern: /^Production immobilis[ée]e$/i, field: "productionCapitalized" },
  { pattern: /^Subventions d'exploitation$/i, field: "operatingSubsidies" },
  { pattern: /^Autres produits$/i, field: "otherOperatingIncome" },
  { pattern: /^PRODUITS D'EXPLOITATION$/i, field: "totalOperatingProducts" },

  // ---- Charges d'exploitation ----
  { pattern: /^Achats de marchandises(\s*\[.*\])?$/i, field: "purchasesGoods" },
  { pattern: /^Variation de stock de marchandises$/i, field: "stockVariationGoods" },
  {
    pattern: /^Achats de mati[èe]res premi[èe]res et autres approvisionnements$/i,
    field: "rawMaterialPurchases"
  },
  {
    pattern: /^Variation de stock \[mati[èe]res premi[èe]res et approvisionnements\]$/i,
    field: "stockVariationRawMaterials"
  },
  { pattern: /^Autres achats et charges externes$/i, field: "externalCharges" },
  {
    pattern: /^IMPOTS, TAXES ET VERSEMENTS ASSIMIL[ÉE]S$/i,
    field: "taxesAndLevies"
  },
  { pattern: /^Salaires et traitements$/i, field: "wages" },
  { pattern: /^Charges sociales$/i, field: "socialCharges" },
  {
    pattern: /^Dotations aux amortissements sur immobilisations$/i,
    field: "depreciationAllocations"
  },
  {
    pattern: /^AUTRES CHARGES D'EXPLOITATION$/i,
    field: "otherOperatingCharges"
  },
  { pattern: /^CHARGES D'EXPLOITATION$/i, field: "totalOperatingCharges" },
  { pattern: /^R[ÉE]SULTAT D'EXPLOITATION$/i, field: "operatingResult" },

  // ---- Résultat financier/exceptionnel (rows totaux linéaires) ----
  { pattern: /^R[ÉE]SULTAT FINANCIER$/i, field: "financialResult" },
  {
    pattern: /^R[ÉE]SULTAT COURANT AVANT IMPOTS$/i,
    field: "ordinaryResultBeforeTax"
  },
  { pattern: /^R[ÉE]SULTAT EXCEPTIONNEL$/i, field: "exceptionalResult" },
  { pattern: /^Imp[ôo]ts sur les b[ée]n[ée]fices$/i, field: "incomeTax" },

  // ---- Totaux finaux ----
  { pattern: /^TOTAL DES PRODUITS$/i, field: "totalProducts" },
  { pattern: /^TOTAL DES CHARGES$/i, field: "totalCharges" },
  { pattern: /^B[ÉE]N[ÉE]FICE OU PERTE$/i, field: "netResult" }
];

export function matchSageCdrLabel(line: string): FinancialFieldKey | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  for (const entry of SAGE_CDR_LABELS) {
    if (entry.pattern.test(trimmed)) return entry.field;
  }
  return null;
}

// ---- BILAN ACTIF Sage (Lot 7C) ----
//
// Le bilan actif Sage a 4 colonnes (BRUT | Amortissements | Net N | Net N-1).
// La section immobilisations (en haut du bilan) est émise column-major par
// Document AI : tous les labels d'abord (lignes 0-29), puis tous les valeurs
// (lignes 42-65 sur TROIS V). Les 4 dernières valeurs correspondent toujours
// à ACTIF IMMOBILISÉ (la row total de la section).
//
// La section Actif circulant (Stocks / Créances / Disponibilités) est émise
// row-major linéairement : chaque label est immédiatement suivi de ses valeurs.
//
// On utilise 2 catégories de marqueurs :
//   - LABELS : extraits vers FinancialFieldKey (fields du bridge)
//   - TERMINATORS : flushent le groupe pending SANS assignation (évitent
//     que les valeurs du subtotal polluent la row détail précédente)

export const SAGE_BILAN_ACTIF_LABELS: readonly SageCdrLabel[] = [
  // Section actif immobilisé — seul le total ACTIF IMMOBILISÉ est fiable
  // (les totaux détail TOTAL immob incorp/corp/fin sont en column-major
  // inexploitable et servent uniquement de terminators).
  { pattern: /^ACTIF IMMOBILIS[ÉE]$/i, field: "totalFixedAssets" },

  // Section actif circulant — détail rows (linéaire)
  { pattern: /^Stocks de marchandises$/i, field: "inventoriesGoods" },
  {
    pattern: /^Cr[ée]ances clients et comptes rattach[ée]s$/i,
    field: "tradeReceivables"
  },
  { pattern: /^Autres cr[ée]ances$/i, field: "otherReceivables" },
  { pattern: /^Disponibilit[ée]s$/i, field: "cashAndCashEquivalents" },
  { pattern: /^Charges constat[ée]es d'avance$/i, field: "prepaidExpenses" },

  // Totaux section actif circulant
  { pattern: /^ACTIF CIRCULANT$/i, field: "totalCurrentAssets" },

  // Total général actif (la PREMIÈRE occurrence de "TOTAL GÉNÉRAL" dans le
  // rawText car la section est scopée à [Bilan Actif, Bilan Passif))
  { pattern: /^TOTAL G[ÉE]N[ÉE]RAL$/i, field: "totalAssets" }
];

// Terminators : flushent le pending group sans affecter de field.
// Empêchent les valeurs de la row subtotal (ex: TOTAL stocks et en-cours)
// d'être accumulées dans la row détail précédente (Stocks de marchandises).
export const SAGE_BILAN_ACTIF_TERMINATORS: readonly RegExp[] = [
  /^TOTAL immobilisations incorporelles\s*:?\s*$/i,
  /^TOTAL immobilisations corporelles\s*:?\s*$/i,
  /^TOTAL immobilisations financi[èe]res\s*:?\s*$/i,
  /^TOTAL stocks et en-cours\s*:?\s*$/i,
  /^TOTAL cr[ée]ances\s*:?\s*$/i,
  /^TOTAL disponibilit[ée]s et divers\s*:?\s*$/i
];

export function matchSageBilanActifLabel(line: string): FinancialFieldKey | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  for (const entry of SAGE_BILAN_ACTIF_LABELS) {
    if (entry.pattern.test(trimmed)) return entry.field;
  }
  return null;
}

export function isSageBilanActifTerminator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return SAGE_BILAN_ACTIF_TERMINATORS.some((pattern) => pattern.test(trimmed));
}

// ---- BILAN PASSIF Sage (Lot 7D) ----
//
// Le bilan passif Sage a 2 colonnes (Net N | Net N-1) contrairement au bilan
// actif qui en a 4 (Brut | Amort | Net N | Net N-1).
//
// Observation Document AI sur TROIS V : les rows du bilan passif linéaire
// (dettes financières, dettes diverses, DETTES grand total, TOTAL GÉNÉRAL)
// émettent leurs valeurs IMMÉDIATEMENT après le label, en row-major.
// Pour les groupes V=2*L (ex: Dettes fournisseurs + Dettes fiscales avec 4
// valeurs), le stream est [Fournisseurs N, Fournisseurs N-1, Fiscales N,
// Fiscales N-1] — row-major. À noter : DIFFÉRENT du bilan actif qui était
// column-major pour le même pattern (groupe Achats + Var stock).
//
// La section capitaux propres est TROP fragile pour le walker générique car
// Document AI émet certains blocs en row-major (Capital/Rés légale positifs)
// et d'autres en column-major (Report/Résultat négatifs). Un handler
// spécialisé extrait Capital, Réserve légale, RAN via scan positionnel.
// Seul le label "CAPITAUX PROPRES" (ligne 41, linéaire) est géré par le
// walker principal pour obtenir total_cp.

export const SAGE_BILAN_PASSIF_LABELS: readonly SageCdrLabel[] = [
  // Total capitaux propres (row linéaire juste après le bloc situation nette)
  { pattern: /^CAPITAUX PROPRES$/i, field: "equity" },

  // Provisions (section header servant aussi de label, vide dans TROIS V)
  {
    pattern: /^PROVISIONS POUR RISQUES ET CHARGES$/i,
    field: "provisions"
  },

  // Dettes financières — on prend le TOTAL (row subtotal "TOTAL dettes
  // financières :") plutôt que les détails Emprunts étab. / Emprunts divers
  // qui sont plus granulaires que les targets user.
  {
    pattern: /^TOTAL dettes financi[èe]res\s*:?\s*$/i,
    field: "borrowings"
  },

  // Dettes diverses — on prend les détails (fournisseurs, fiscales/sociales)
  // car ils sont des targets user distincts.
  {
    pattern: /^Dettes fournisseurs et comptes rattach[ée]s$/i,
    field: "tradePayables"
  },
  { pattern: /^Dettes fiscales et sociales$/i, field: "taxSocialPayables" },

  // Produits constatés d'avance (row vide dans TROIS V mais utile pour robustesse)
  {
    pattern: /^PRODUITS CONSTAT[ÉE]S D'AVANCE$/i,
    field: "deferredIncome"
  },

  // Grand total dettes (DETTES seul, pas "DETTES FINANCIÈRES" ni "DETTES DIVERSES")
  { pattern: /^DETTES$/i, field: "debts" },

  // TOTAL GÉNÉRAL passif (première occurrence dans la section scopée
  // [Bilan Passif, CDR) = passif puisque l'actif est avant)
  { pattern: /^TOTAL G[ÉE]N[ÉE]RAL$/i, field: "totalLiabilities" }
];

// Terminators bilan passif : flushent le pending group sans assignation.
// Empêchent la pollution des fenêtres de valeurs entre section headers et
// labels détail.
export const SAGE_BILAN_PASSIF_TERMINATORS: readonly RegExp[] = [
  /^AUTRES FONDS PROPRES$/i,
  /^DETTES FINANCI[ÈE]RES$/i,
  /^AVANCES ET ACOMPTES RECUS SUR COMMANDES EN COURS$/i,
  /^DETTES DIVERSES$/i,
  /^TOTAL situation nette\s*:?\s*$/i,
  /^TOTAL dettes diverses\s*:?\s*$/i,
  /^Ecarts de conversion passif$/i
];

export function matchSageBilanPassifLabel(line: string): FinancialFieldKey | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  for (const entry of SAGE_BILAN_PASSIF_LABELS) {
    if (entry.pattern.test(trimmed)) return entry.field;
  }
  return null;
}

export function isSageBilanPassifTerminator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return SAGE_BILAN_PASSIF_TERMINATORS.some((pattern) => pattern.test(trimmed));
}
