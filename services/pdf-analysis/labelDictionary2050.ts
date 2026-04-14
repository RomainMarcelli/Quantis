import type { FinancialFieldKey } from "@/services/pdf-analysis/types";

// Mapping des codes alphabétiques DGFiP 2050/2052/2053 vers les champs
// FinancialFieldKey du modèle interne. Ce mapping couvre LE CDR uniquement
// (Lot 6B). Bilan actif (Lot 6D) et bilan passif (Lot 6C) viendront après.
//
// Colonnes :
//  - "france"  : colonne France (CDR 2052, codes FA/FD/FG/FJ)
//  - "total"   : colonne Total (CDR 2052, codes FC/FF/FI/FL — préférée)
//  - "unique"  : colonne unique (tous les autres codes CDR)

export type AlphaCodeColumn = "france" | "export" | "total" | "unique";

export type AlphaCodeDefinition = {
  field: FinancialFieldKey;
  column: AlphaCodeColumn;
};

export const ALPHA_CODE_MAPPING_2050: Record<string, AlphaCodeDefinition> = {
  // ---- CDR 2052 — Produits d'exploitation (3 colonnes France/Export/Total) ----
  FA: { field: "salesGoods", column: "france" },
  FC: { field: "salesGoods", column: "total" },
  FD: { field: "productionSoldGoods", column: "france" },
  FF: { field: "productionSoldGoods", column: "total" },
  FG: { field: "productionSoldServices", column: "france" },
  FI: { field: "productionSoldServices", column: "total" },
  FJ: { field: "netTurnover", column: "france" },
  FL: { field: "netTurnover", column: "total" },

  // ---- CDR 2052 — Produits d'exploitation (colonne unique) ----
  FM: { field: "productionStored", column: "unique" },
  FN: { field: "productionCapitalized", column: "unique" },
  FO: { field: "operatingSubsidies", column: "unique" },
  FQ: { field: "otherOperatingIncome", column: "unique" },
  FR: { field: "totalOperatingProducts", column: "unique" },

  // ---- CDR 2052 — Charges d'exploitation ----
  FS: { field: "purchasesGoods", column: "unique" },
  FW: { field: "externalCharges", column: "unique" },
  FX: { field: "taxesAndLevies", column: "unique" },
  FY: { field: "wages", column: "unique" },
  FZ: { field: "socialCharges", column: "unique" },
  GA: { field: "depreciationAllocations", column: "unique" },
  GE: { field: "otherOperatingCharges", column: "unique" },
  GF: { field: "totalOperatingCharges", column: "unique" },
  GG: { field: "operatingResult", column: "unique" },

  // ---- CDR 2052 — Résultat financier ----
  GP: { field: "financialProducts", column: "unique" },
  GU: { field: "financialCharges", column: "unique" },
  GV: { field: "financialResult", column: "unique" },
  GW: { field: "ordinaryResultBeforeTax", column: "unique" },

  // ---- CDR 2053 — Résultat exceptionnel et totaux ----
  // Note : HA (produits excep sur opés de gestion) n'a pas de field dédié dans
  // FinancialFieldKey — on préfère HD (total produits exceptionnels, VII) qui
  // agrège tous les sous-codes HA/HB/HC.
  HD: { field: "exceptionalProducts", column: "unique" },
  HH: { field: "exceptionalCharges", column: "unique" },
  HI: { field: "exceptionalResult", column: "unique" },
  HK: { field: "incomeTax", column: "unique" },
  HL: { field: "totalProducts", column: "unique" },
  HM: { field: "totalCharges", column: "unique" },
  HN: { field: "netResult", column: "unique" },

  // ---- BILAN PASSIF 2051 (Lot 6C) — colonne unique ----
  // Capitaux propres
  DA: { field: "shareCapital", column: "unique" },
  DD: { field: "legalReserves", column: "unique" },
  DH: { field: "retainedEarnings", column: "unique" },
  // Note : DI (résultat de l'exercice passif) n'a pas de field dédié dans
  // FinancialFieldKey — il double HN du CDR, donc on ne le mappe pas pour
  // éviter toute collision.
  DL: { field: "equity", column: "unique" }, // TOTAL (I) capitaux propres

  // Provisions : DP = détail (provisions pour risques), DR = TOTAL (III).
  // On préfère DR via colonne "total" pour garantir le total sur le champ.
  DP: { field: "provisions", column: "unique" },
  DR: { field: "provisions", column: "total" },

  // Dettes : détail + total
  DU: { field: "borrowings", column: "unique" },
  DX: { field: "tradePayables", column: "unique" },
  DY: { field: "taxSocialPayables", column: "unique" },
  EA: { field: "otherDebts", column: "unique" },
  EB: { field: "deferredIncome", column: "unique" },
  EC: { field: "debts", column: "unique" }, // TOTAL (IV) dettes
  EE: { field: "totalLiabilities", column: "unique" } // TOTAL GÉNÉRAL (I à V)
};

// Pour résoudre un champ, on préfère la colonne "total" > "france" > "unique".
// Ce tie-break reflète la réalité 2052 : le CA "Total" est égal au CA "France"
// quand l'entreprise n'a pas d'export, mais sémantiquement on veut le Total.
export const COLUMN_PRIORITY: Record<AlphaCodeColumn, number> = {
  total: 3,
  france: 2,
  unique: 1,
  export: 0
};

// ---- BILAN ACTIF 2050 (Lot 6D) ----
//
// Chaque ligne du bilan actif a 2 codes : un pour la colonne Brut, un pour la
// colonne Amortissement/Provisions. La colonne Net est calculée et imprimée
// SANS code (Net = Brut - Amort).
//
// Les pipelines d'extraction (extractActifRowValues) récupèrent un triplet de
// valeurs par row et assignent la dernière (Net) au champ `netField`. Pour le
// total des immobilisations (BJ/BK), on remplit aussi `brutField` avec la
// valeur Brut.
//
// Note : AH représente ici "Fonds commercial" dans le formulaire officiel.
// Sur AG FRANCE, c'est la seule ligne incorporelle non-nulle, donc AH = total
// incorporelles. Sur un autre PDF avec plusieurs sous-lignes incorporelles
// remplies, il faudra sommer (AB + CX + AF + AH + AJ + AL) — non couvert ici.
export type ActifRowDefinition = {
  brutCode: string;
  amortCode: string;
  netField?: FinancialFieldKey;
  brutField?: FinancialFieldKey;
};

export const ACTIF_ROWS_2050: readonly ActifRowDefinition[] = [
  // Actif immobilisé
  { brutCode: "AH", amortCode: "AI", netField: "intangibleAssets" },
  { brutCode: "AT", amortCode: "AU", netField: "tangibleAssets" },
  { brutCode: "BH", amortCode: "BI", netField: "financialAssets" },
  {
    brutCode: "BJ",
    amortCode: "BK",
    netField: "totalFixedAssets",
    brutField: "totalFixedAssetsGross"
  },

  // Actif circulant
  { brutCode: "BT", amortCode: "BU", netField: "inventoriesGoods" },
  { brutCode: "BX", amortCode: "BY", netField: "tradeReceivables" },
  { brutCode: "BZ", amortCode: "CA", netField: "otherReceivables" },
  { brutCode: "CF", amortCode: "CG", netField: "cashAndCashEquivalents" },
  { brutCode: "CH", amortCode: "CI", netField: "prepaidExpenses" },
  { brutCode: "CJ", amortCode: "CK", netField: "totalCurrentAssets" },

  // Total général (1A est le code Amort spécial de la ligne TOTAL GÉNÉRAL)
  { brutCode: "CO", amortCode: "1A", netField: "totalAssets" }
];
