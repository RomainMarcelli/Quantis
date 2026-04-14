import type { DocumentAIExtractionResult } from "@/services/documentAI";

export type DocumentAIResponse = Pick<DocumentAIExtractionResult, "rawText" | "pages" | "tables">;

export type ParsedFinancialData = {
  incomeStatement: {
    salesGoods: number | null;
    productionSoldGoods: number | null;
    productionSoldServices: number | null;
    productionSold: number | null;
    productionStored: number | null;
    productionCapitalized: number | null;
    operatingSubsidies: number | null;
    purchasesGoods: number | null;
    stockVariationGoods: number | null;
    rawMaterialPurchases: number | null;
    stockVariationRawMaterials: number | null;
    externalCharges: number | null;
    taxesAndLevies: number | null;
    wages: number | null;
    socialCharges: number | null;
    depreciationAllocations: number | null;
    provisionsAllocations: number | null;
    netTurnover: number | null;
    netTurnoverPreviousYear: number | null;
    otherOperatingIncome: number | null;
    otherOperatingCharges: number | null;
    financialProducts: number | null;
    financialCharges: number | null;
    exceptionalProducts: number | null;
    exceptionalCharges: number | null;
    incomeTax: number | null;
    totalOperatingProducts: number | null;
    totalOperatingCharges: number | null;
    operatingResult: number | null;
    financialResult: number | null;
    ordinaryResultBeforeTax: number | null;
    exceptionalResult: number | null;
    totalProducts: number | null;
    totalCharges: number | null;
    netResult: number | null;
    revenue: number | null;
    production: number | null;
  };
  balanceSheet: {
    intangibleAssets: number | null;
    tangibleAssets: number | null;
    financialAssets: number | null;
    totalFixedAssetsGross: number | null;
    totalFixedAssets: number | null;
    totalCurrentAssets: number | null;
    rawMaterialInventories: number | null;
    inventoriesGoods: number | null;
    advancesAndPrepaymentsAssets: number | null;
    tradeReceivables: number | null;
    otherReceivables: number | null;
    marketableSecurities: number | null;
    cashAndCashEquivalents: number | null;
    prepaidExpenses: number | null;
    totalAssets: number | null;
    shareCapital: number | null;
    revaluationDifferences: number | null;
    legalReserves: number | null;
    regulatoryReserves: number | null;
    otherReserves: number | null;
    retainedEarnings: number | null;
    investmentSubsidies: number | null;
    regulatoryProvisions: number | null;
    equity: number | null;
    provisions: number | null;
    borrowings: number | null;
    debts: number | null;
    advancesAndPrepaymentsLiabilities: number | null;
    tradePayables: number | null;
    taxSocialPayables: number | null;
    associatesCurrentAccounts: number | null;
    otherDebts: number | null;
    deferredIncome: number | null;
    totalLiabilities: number | null;
    totalAssetDepreciationProvisions: number | null;
    shortTermBankDebt: number | null;
    longTermBankDebt: number | null;
  };
};

export type DetectedFinancialSections = {
  incomeStatement: boolean;
  balanceSheet: boolean;
};

export type SectionKey = "incomeStatement" | "balanceSheet" | "unknown";

export type CdrLayout = "standard" | "inverted" | "unknown";

export type FinancialExtractionDiagnostics = {
  confidenceScore: number;
  warnings: string[];
  fieldScores: Record<string, number>;
  consistencyChecks: Array<{
    name: string;
    status: "ok" | "warning";
    message: string;
  }>;
};

export type AmountCandidate = {
  raw: string;
  value: number;
  columnIndex: number;
  headerHint: string | null;
  charIndex: number;
};

export type ReconstructedRow = {
  rowId: string;
  source: "table" | "text";
  page: number;
  rowNumber: number;
  section: SectionKey;
  label: string;
  normalizedLabel: string;
  fullText: string;
  lineCode: string | null;
  amountCandidates: AmountCandidate[];
  headersByColumn: Record<number, string>;
};

export type FieldColumnStrategy =
  | "nCurrent"
  | "nMinus1"
  | "netPriority"
  | "leftmost"
  | "rightmost"
  | "signedRightmost";

export type FieldKind = "total" | "detail" | "result";

export type FinancialFieldKey =
  | "salesGoods"
  | "productionSoldGoods"
  | "productionSoldServices"
  | "productionSold"
  | "purchasesGoods"
  | "stockVariationGoods"
  | "rawMaterialPurchases"
  | "stockVariationRawMaterials"
  | "externalCharges"
  | "taxesAndLevies"
  | "wages"
  | "socialCharges"
  | "depreciationAllocations"
  | "provisionsAllocations"
  | "netTurnover"
  | "otherOperatingIncome"
  | "otherOperatingCharges"
  | "financialProducts"
  | "financialCharges"
  | "exceptionalProducts"
  | "exceptionalCharges"
  | "incomeTax"
  | "totalOperatingProducts"
  | "totalOperatingCharges"
  | "operatingResult"
  | "financialResult"
  | "ordinaryResultBeforeTax"
  | "exceptionalResult"
  | "totalProducts"
  | "totalCharges"
  | "netResult"
  | "netTurnoverPreviousYear"
  | "productionStored"
  | "productionCapitalized"
  | "operatingSubsidies"
  | "intangibleAssets"
  | "tangibleAssets"
  | "financialAssets"
  | "totalFixedAssetsGross"
  | "totalFixedAssets"
  | "totalCurrentAssets"
  | "rawMaterialInventories"
  | "inventoriesGoods"
  | "advancesAndPrepaymentsAssets"
  | "tradeReceivables"
  | "otherReceivables"
  | "marketableSecurities"
  | "cashAndCashEquivalents"
  | "prepaidExpenses"
  | "totalAssets"
  | "shareCapital"
  | "revaluationDifferences"
  | "legalReserves"
  | "regulatoryReserves"
  | "otherReserves"
  | "retainedEarnings"
  | "investmentSubsidies"
  | "regulatoryProvisions"
  | "equity"
  | "provisions"
  | "borrowings"
  | "debts"
  | "advancesAndPrepaymentsLiabilities"
  | "tradePayables"
  | "taxSocialPayables"
  | "associatesCurrentAccounts"
  | "otherDebts"
  | "deferredIncome"
  | "totalLiabilities"
  | "totalAssetDepreciationProvisions"
  | "shortTermBankDebt"
  | "longTermBankDebt";

export type FieldDefinition = {
  key: FinancialFieldKey;
  section: Exclude<SectionKey, "unknown">;
  kind: FieldKind;
  columnStrategy: FieldColumnStrategy;
  aliases: string[];
  regexAliases: RegExp[];
  excludes: string[];
  expectedLineCodes?: string[];
  minAbs?: number;
  allowNegative?: boolean;
  /** Quand le label est un en-tête de section sans montant propre, sommer les sous-lignes. */
  sublineStrategy?: "sum";
  /** Patterns pour identifier les sous-lignes par contexte (cas où l'en-tête de section est absent du PDF). */
  sublinePatterns?: RegExp[];
};

export type CandidateTrace = {
  value: number;
  score: number;
  rowText: string;
  page: number;
  rowNumber: number;
  columnIndex: number;
  headerHint: string | null;
  reason: string;
};

export type FieldSelectionTrace = {
  field: FinancialFieldKey;
  selected: CandidateTrace | null;
  alternatives: CandidateTrace[];
};

export type AnalysisResult = {
  parsedFinancialData: ParsedFinancialData;
  detectedSections: DetectedFinancialSections;
  diagnostics: FinancialExtractionDiagnostics;
  traces: FieldSelectionTrace[];
  rows: ReconstructedRow[];
};

export function createEmptyParsedFinancialData(): ParsedFinancialData {
  return {
    incomeStatement: {
      salesGoods: null,
      productionSoldGoods: null,
      productionSoldServices: null,
      productionSold: null,
      productionStored: null,
      productionCapitalized: null,
      operatingSubsidies: null,
      purchasesGoods: null,
      stockVariationGoods: null,
      rawMaterialPurchases: null,
      stockVariationRawMaterials: null,
      externalCharges: null,
      taxesAndLevies: null,
      wages: null,
      socialCharges: null,
      depreciationAllocations: null,
      provisionsAllocations: null,
      netTurnover: null,
      netTurnoverPreviousYear: null,
      otherOperatingIncome: null,
      otherOperatingCharges: null,
      financialProducts: null,
      financialCharges: null,
      exceptionalProducts: null,
      exceptionalCharges: null,
      incomeTax: null,
      totalOperatingProducts: null,
      totalOperatingCharges: null,
      operatingResult: null,
      financialResult: null,
      ordinaryResultBeforeTax: null,
      exceptionalResult: null,
      totalProducts: null,
      totalCharges: null,
      netResult: null,
      revenue: null,
      production: null
    },
    balanceSheet: {
      intangibleAssets: null,
      tangibleAssets: null,
      financialAssets: null,
      totalFixedAssetsGross: null,
      totalFixedAssets: null,
      totalCurrentAssets: null,
      rawMaterialInventories: null,
      inventoriesGoods: null,
      advancesAndPrepaymentsAssets: null,
      tradeReceivables: null,
      otherReceivables: null,
      marketableSecurities: null,
      cashAndCashEquivalents: null,
      prepaidExpenses: null,
      totalAssets: null,
      shareCapital: null,
      revaluationDifferences: null,
      legalReserves: null,
      regulatoryReserves: null,
      otherReserves: null,
      retainedEarnings: null,
      investmentSubsidies: null,
      regulatoryProvisions: null,
      equity: null,
      provisions: null,
      borrowings: null,
      debts: null,
      advancesAndPrepaymentsLiabilities: null,
      tradePayables: null,
      taxSocialPayables: null,
      associatesCurrentAccounts: null,
      otherDebts: null,
      deferredIncome: null,
      totalLiabilities: null,
      totalAssetDepreciationProvisions: null,
      shortTermBankDebt: null,
      longTermBankDebt: null
    }
  };
}
