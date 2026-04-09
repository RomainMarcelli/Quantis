import type { DocumentAIExtractionResult } from "@/services/documentAI";

export type DocumentAIResponse = Pick<DocumentAIExtractionResult, "rawText" | "pages" | "tables">;

export type ParsedFinancialData = {
  incomeStatement: {
    salesGoods: number | null;
    productionSoldGoods: number | null;
    productionSoldServices: number | null;
    productionSold: number | null;
    netTurnover: number | null;
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
    totalFixedAssets: number | null;
    totalCurrentAssets: number | null;
    inventoriesGoods: number | null;
    tradeReceivables: number | null;
    otherReceivables: number | null;
    cashAndCashEquivalents: number | null;
    prepaidExpenses: number | null;
    totalAssets: number | null;
    equity: number | null;
    provisions: number | null;
    debts: number | null;
    tradePayables: number | null;
    taxSocialPayables: number | null;
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
  | "rightmost"
  | "signedRightmost";

export type FieldKind = "total" | "detail" | "result";

export type FinancialFieldKey =
  | "salesGoods"
  | "productionSoldGoods"
  | "productionSoldServices"
  | "productionSold"
  | "netTurnover"
  | "totalOperatingProducts"
  | "totalOperatingCharges"
  | "operatingResult"
  | "financialResult"
  | "ordinaryResultBeforeTax"
  | "exceptionalResult"
  | "totalProducts"
  | "totalCharges"
  | "netResult"
  | "intangibleAssets"
  | "tangibleAssets"
  | "financialAssets"
  | "totalFixedAssets"
  | "totalCurrentAssets"
  | "inventoriesGoods"
  | "tradeReceivables"
  | "otherReceivables"
  | "cashAndCashEquivalents"
  | "prepaidExpenses"
  | "totalAssets"
  | "equity"
  | "provisions"
  | "debts"
  | "tradePayables"
  | "taxSocialPayables"
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
      netTurnover: null,
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
      totalFixedAssets: null,
      totalCurrentAssets: null,
      inventoriesGoods: null,
      tradeReceivables: null,
      otherReceivables: null,
      cashAndCashEquivalents: null,
      prepaidExpenses: null,
      totalAssets: null,
      equity: null,
      provisions: null,
      debts: null,
      tradePayables: null,
      taxSocialPayables: null,
      otherDebts: null,
      deferredIncome: null,
      totalLiabilities: null,
      totalAssetDepreciationProvisions: null,
      shortTermBankDebt: null,
      longTermBankDebt: null
    }
  };
}
