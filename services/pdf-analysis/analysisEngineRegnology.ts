import { buildDiagnostics } from "@/services/pdf-analysis/diagnostics";
import { buildReconstructedRows } from "@/services/pdf-analysis/rowReconstruction";
import {
  extractRegnologyBilanActifFromRawText,
  extractRegnologyBilanPassifValues,
  extractRegnologyCdrValues
} from "@/services/pdf-analysis/rowReconstructionRegnology";
import type {
  AnalysisResult,
  DocumentAIResponse,
  FieldSelectionTrace,
  FinancialFieldKey,
  ReconstructedRow
} from "@/services/pdf-analysis/types";
import { mapFieldValuesToParsedData } from "@/services/pdf-analysis/valueMapping";

// Pipeline d'analyse pour les liasses fiscales exportées via Regnology
// (layout 4 colonnes Brut/Amort/Net/N-1 dans les bilans, 2 colonnes N/N-1
// dans le CDR, labels textuels sans codes alphanumériques).
//
// Phase 3B-3 — Implémentation réelle. Pattern identique à analyzeDocumentSage :
//   1. Reconstruire les rows via buildReconstructedRows (pipeline 2033-sd).
//   2. Appeler les 3 extracteurs spécialisés Regnology (CDR, bilan actif,
//      bilan passif) sur les rows.
//   3. Fusionner les résultats dans un record values[] + construire les traces.
//   4. Assembler un AnalysisResult standard.
//
// Debug : définir REGNOLOGY_DEBUG=true pour activer 2 logs d'inspection
// (pré-extraction : rows + sections ; post-extraction : valeurs par section).
export function analyzeDocumentRegnology(document: DocumentAIResponse): AnalysisResult {
  const rawText = document.rawText ?? "";
  const rows = buildReconstructedRows(document);

  if (isRegnologyDebugEnabled()) {
    logPreExtractionSnapshot(rows);
  }

  const values = createEmptyFieldValues();
  const traces: FieldSelectionTrace[] = [];

  // ---- CDR Regnology ----
  const cdrValues = extractRegnologyCdrValues(rows);
  for (const [field, value] of cdrValues) {
    values[field] = value;
    traces.push(buildTrace(field, value, "regnology-cdr", "regnology_cdr_label_match"));
  }

  // ---- Bilan actif Regnology ----
  //
  // On utilise le walker rawText dédié (extractRegnologyBilanActifFromRawText)
  // au lieu de l'extracteur basé sur les rows reconstruites, car
  // buildReconstructedRows ne gère pas correctement les rows détail à 4
  // colonnes Brut/Amort/Net N/Net N-1 (il ne produit qu'un candidat par row
  // détail → récupère du Brut au lieu du Net N).
  const bilanActifValues = extractRegnologyBilanActifFromRawText(rawText);
  for (const [field, value] of bilanActifValues) {
    values[field] = value;
    traces.push(
      buildTrace(field, value, "regnology-bilan-actif", "regnology_bilan_actif_label_match")
    );
  }

  // ---- Bilan passif Regnology ----
  const bilanPassifValues = extractRegnologyBilanPassifValues(rows);
  for (const [field, value] of bilanPassifValues) {
    values[field] = value;
    traces.push(
      buildTrace(field, value, "regnology-bilan-passif", "regnology_bilan_passif_label_match")
    );
  }

  if (isRegnologyDebugEnabled()) {
    logPostExtractionSnapshot({ cdrValues, bilanActifValues, bilanPassifValues });
  }

  const parsedFinancialData = mapFieldValuesToParsedData(values);
  const diagnostics = buildDiagnostics({
    parsedFinancialData,
    traces
  });

  return {
    parsedFinancialData,
    detectedSections: {
      incomeStatement: cdrValues.size > 0,
      balanceSheet: bilanActifValues.size > 0 || bilanPassifValues.size > 0
    },
    diagnostics,
    traces,
    rows
  };
}

function buildTrace(
  field: FinancialFieldKey,
  value: number | null,
  tracePrefix: string,
  reason: string
): FieldSelectionTrace {
  if (value === null) {
    return {
      field,
      selected: null,
      alternatives: []
    };
  }
  return {
    field,
    selected: {
      value,
      score: 100,
      rowText: `[${tracePrefix}] ${field}=${value}`,
      page: 0,
      rowNumber: 0,
      columnIndex: 0,
      headerHint: null,
      reason
    },
    alternatives: []
  };
}

function isRegnologyDebugEnabled(): boolean {
  return process.env.REGNOLOGY_DEBUG === "true";
}

function logPreExtractionSnapshot(rows: readonly ReconstructedRow[]): void {
  const sectionCounts = rows.reduce(
    (acc, row) => {
      acc[row.section] = (acc[row.section] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  console.info("[regnology] pre-extraction rows summary", {
    totalRows: rows.length,
    sectionCounts
  });
}

function logPostExtractionSnapshot(input: {
  cdrValues: Map<FinancialFieldKey, number | null>;
  bilanActifValues: Map<FinancialFieldKey, number | null>;
  bilanPassifValues: Map<FinancialFieldKey, number | null>;
}): void {
  const { cdrValues, bilanActifValues, bilanPassifValues } = input;
  console.info("[regnology] post-extraction values", {
    cdr: Object.fromEntries(cdrValues),
    bilanActif: Object.fromEntries(bilanActifValues),
    bilanPassif: Object.fromEntries(bilanPassifValues)
  });
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
