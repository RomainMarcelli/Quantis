import { buildDiagnostics } from "@/services/pdf-analysis/diagnostics";
import {
  extractSageBilanActifValues,
  extractSageBilanPassifValues,
  extractSageCdrValues
} from "@/services/pdf-analysis/rowReconstructionSage";
import type {
  AnalysisResult,
  DocumentAIResponse,
  FieldSelectionTrace,
  FinancialFieldKey
} from "@/services/pdf-analysis/types";
import { mapFieldValuesToParsedData } from "@/services/pdf-analysis/valueMapping";

// Pipeline d'analyse pour les liasses fiscales exportées via Sage.
//
// Lot 7A — STUB : détection de format branchée, pipeline d'extraction vide.
// Lot 7B — CDR Sage : extraction via labelDictionarySage + row reconstruction
//                     scope sur "Compte de Résultat (Première Partie)".
// Lot 7C — Bilan actif Sage : extraction via SAGE_BILAN_ACTIF_LABELS scopé
//                             entre "Bilan Actif" et "Bilan Passif".
// Lot 7D — Bilan passif Sage : extraction via SAGE_BILAN_PASSIF_LABELS scopé
//                              entre "Bilan Passif" et CDR. Inclut un
//                              handler spécialisé pour les capitaux propres.
export function analyzeDocumentSage(document: DocumentAIResponse): AnalysisResult {
  const rawText = document.rawText ?? "";

  const values = createEmptyFieldValues();
  const traces: FieldSelectionTrace[] = [];

  // ---- Lot 7B — Extraction CDR Sage ----
  const cdrValues = extractSageCdrValues(rawText);
  for (const [field, value] of cdrValues) {
    values[field] = value;
    traces.push({
      field,
      selected: {
        value,
        score: 100,
        rowText: `[sage-cdr] ${field}=${value}`,
        page: 0,
        rowNumber: 0,
        columnIndex: 0,
        headerHint: null,
        reason: "sage_cdr_label_match"
      },
      alternatives: []
    });
  }

  // ---- Lot 7C — Extraction bilan actif Sage ----
  const bilanActifValues = extractSageBilanActifValues(rawText);
  for (const [field, value] of bilanActifValues) {
    values[field] = value;
    traces.push({
      field,
      selected: {
        value,
        score: 100,
        rowText: `[sage-bilan-actif] ${field}=${value}`,
        page: 0,
        rowNumber: 0,
        columnIndex: 0,
        headerHint: null,
        reason: "sage_bilan_actif_label_match"
      },
      alternatives: []
    });
  }

  // ---- Lot 7D — Extraction bilan passif Sage ----
  const bilanPassifValues = extractSageBilanPassifValues(rawText);
  for (const [field, value] of bilanPassifValues) {
    values[field] = value;
    traces.push({
      field,
      selected: {
        value,
        score: 100,
        rowText: `[sage-bilan-passif] ${field}=${value}`,
        page: 0,
        rowNumber: 0,
        columnIndex: 0,
        headerHint: null,
        reason: "sage_bilan_passif_label_match"
      },
      alternatives: []
    });
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
    rows: []
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
