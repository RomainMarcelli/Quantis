import { buildDiagnostics } from "@/services/pdf-analysis/diagnostics";
import {
  ACTIF_ROWS_2050,
  ALPHA_CODE_MAPPING_2050,
  COLUMN_PRIORITY,
  type AlphaCodeColumn
} from "@/services/pdf-analysis/labelDictionary2050";
import {
  buildAlphaCodedRows,
  extractActifRowValues,
  type AlphaCodedRow
} from "@/services/pdf-analysis/rowReconstruction2050";
import type {
  AnalysisResult,
  CandidateTrace,
  DocumentAIResponse,
  FieldSelectionTrace,
  FinancialFieldKey
} from "@/services/pdf-analysis/types";
import { mapFieldValuesToParsedData } from "@/services/pdf-analysis/valueMapping";

// Pipeline d'analyse pour les liasses fiscales au format DGFiP 2050/2051/2052/2053.
//
// Lot 6B — CDR (compte de résultat 2052/2053).
// Lot 6C — Bilan passif 2051 (capitaux propres, provisions, dettes).
// Lot 6D — Bilan actif 2050 (3 colonnes Brut / Amort / Net via triplet).
// Le routing depuis analysisEngine.ts décide d'appeler cette fonction quand
// detectDocumentFormat() renvoie "dgfip-2050".
export function analyzeDocument2050(document: DocumentAIResponse): AnalysisResult {
  const rawText = document.rawText ?? "";
  const alphaRows = buildAlphaCodedRows(rawText);

  const { values, traces } = resolveFieldValuesFromAlphaRows(alphaRows);

  // ---- Lot 6D — Bilan actif (triplet Brut/Amort/Net par row) ----
  const actifExtracts = extractActifRowValues(
    rawText,
    ACTIF_ROWS_2050.map((row) => row.brutCode)
  );
  for (const row of ACTIF_ROWS_2050) {
    const extract = actifExtracts.get(row.brutCode);
    if (!extract) continue;
    if (row.netField && extract.net !== null) {
      values[row.netField] = extract.net;
    }
    if (row.brutField && extract.brut !== null) {
      values[row.brutField] = extract.brut;
    }
    if (extract.net !== null || extract.brut !== null) {
      traces.push({
        field: (row.netField ?? row.brutField) as FinancialFieldKey,
        selected: {
          value: extract.net ?? extract.brut ?? 0,
          score: 100,
          rowText: `[2050-actif] ${row.brutCode}/${row.amortCode} brut=${extract.brut} amort=${extract.amort} net=${extract.net}`,
          page: 0,
          rowNumber: 0,
          columnIndex: 0,
          headerHint: "net",
          reason: "actif_triplet_extract"
        },
        alternatives: []
      });
    }
  }

  const parsedFinancialData = mapFieldValuesToParsedData(values);

  const hasCdrCodes = alphaRows.some((row) => /^[FGH]/.test(row.code));
  const hasPassifCodes = alphaRows.some((row) => /^[DE]/.test(row.code));
  const hasActifValues = Array.from(actifExtracts.values()).some(
    (extract) => extract.net !== null
  );
  const detectedSections = {
    incomeStatement: hasCdrCodes,
    balanceSheet: hasPassifCodes || hasActifValues
  };

  const diagnostics = buildDiagnostics({
    parsedFinancialData,
    traces
  });

  return {
    parsedFinancialData,
    detectedSections,
    diagnostics,
    traces,
    rows: []
  };
}

function resolveFieldValuesFromAlphaRows(alphaRows: AlphaCodedRow[]): {
  values: Record<FinancialFieldKey, number | null>;
  traces: FieldSelectionTrace[];
} {
  const values = createEmptyFieldValues();

  // Buffer par champ : on conserve toutes les rows qui le renseignent pour
  // choisir la meilleure colonne (total > france > unique).
  const perField: Partial<
    Record<
      FinancialFieldKey,
      Array<{ row: AlphaCodedRow; column: AlphaCodeColumn; priority: number }>
    >
  > = {};

  for (const row of alphaRows) {
    const def = ALPHA_CODE_MAPPING_2050[row.code];
    if (!def) continue;

    const entry = {
      row,
      column: def.column,
      priority: COLUMN_PRIORITY[def.column] ?? 0
    };
    const bucket = perField[def.field] ?? [];
    bucket.push(entry);
    perField[def.field] = bucket;
  }

  const traces: FieldSelectionTrace[] = [];
  for (const [field, bucket] of Object.entries(perField) as Array<
    [FinancialFieldKey, Array<{ row: AlphaCodedRow; column: AlphaCodeColumn; priority: number }>]
  >) {
    if (!bucket || bucket.length === 0) continue;

    bucket.sort((left, right) => right.priority - left.priority);
    const winner = bucket[0];
    values[field] = winner.row.value;

    traces.push({
      field,
      selected: toAlphaCandidateTrace(winner.row, winner.column, "column_priority_winner"),
      alternatives: bucket
        .slice(1)
        .map((entry) => toAlphaCandidateTrace(entry.row, entry.column, "column_priority_alt"))
    });
  }

  return { values, traces };
}

function toAlphaCandidateTrace(
  row: AlphaCodedRow,
  column: AlphaCodeColumn,
  reason: string
): CandidateTrace {
  return {
    value: row.value,
    score: 100,
    rowText: `[2050] code=${row.code}`,
    page: 0,
    rowNumber: row.line,
    columnIndex: 0,
    headerHint: column,
    reason
  };
}

function createEmptyFieldValues(): Record<FinancialFieldKey, number | null> {
  return {
    salesGoods: null,
    productionSoldGoods: null,
    productionSoldServices: null,
    productionSold: null,
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
    netTurnoverPreviousYear: null,
    productionStored: null,
    productionCapitalized: null,
    operatingSubsidies: null,
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
  };
}
