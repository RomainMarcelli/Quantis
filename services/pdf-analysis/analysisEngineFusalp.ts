import { buildDiagnostics } from "@/services/pdf-analysis/diagnostics";
import {
  buildFusalpVisualLines,
  extractFusalpValuesFromVisualLines
} from "@/services/pdf-analysis/spatialExtractorFusalp";
import { buildReconstructedRows } from "@/services/pdf-analysis/rowReconstruction";
import type {
  AnalysisResult,
  DocumentAIResponse,
  FieldSelectionTrace,
  FinancialFieldKey,
  ReconstructedRow
} from "@/services/pdf-analysis/types";
import { mapFieldValuesToParsedData } from "@/services/pdf-analysis/valueMapping";

// Pipeline d'analyse pour les liasses fiscales Fiducial Audit (ex : Fusalp).
//
// Architecture : pattern identique à analyzeDocumentRegnology — extraction
// spatiale via les tokens Document AI, reconstitution de lignes visuelles,
// puis match label → valeur via les 3 dictionnaires Fiducial (CDR / bilan
// actif / bilan passif).
//
// Particularités vs Regnology :
//   - Tokens orientation PAGE_UP uniquement (pas de rotation 90°)
//   - MAX_PAGE_NUMBER = 5 (scope pages 1-5 : cover + bilans + CDR + CDR suite)
//   - CDR tri-colonne France | Export | Total (vs Regnology 2 colonnes N/N-1)
//     * 3+ candidats → index 2 (Total N)
//     * 2 candidats  → somme si ratio smaller/larger ∈ [0.05, 0.65], sinon index 0
//     * 1 candidat   → index 0
//
// Debug : définir FIDUCIAL_DEBUG=true pour activer les snapshots pré/post extraction.
export function analyzeDocumentFusalp(document: DocumentAIResponse): AnalysisResult {
  // buildReconstructedRows est appelé ici uniquement pour alimenter le champ
  // `rows` du AnalysisResult retourné (cohérence avec les autres pipelines et
  // usage downstream par le panneau diagnostic UI). Les valeurs ne sont PAS
  // extraites via ce walker — uniquement via l'extracteur spatial.
  const rows = buildReconstructedRows(document);

  const visualLines = buildFusalpVisualLines(document);
  console.log("[fiducial-spatial] total visual lines:", visualLines.length);

  const {
    cdr: cdrValues,
    bilanActif: bilanActifValues,
    bilanPassif: bilanPassifValues
  } = extractFusalpValuesFromVisualLines(visualLines);

  if (isFiducialDebugEnabled()) {
    logPreExtractionSnapshot(rows);
  }

  const values = createEmptyFieldValues();
  const traces: FieldSelectionTrace[] = [];

  // ---- CDR Fiducial ----
  for (const [field, value] of cdrValues) {
    values[field] = value;
    traces.push(buildTrace(field, value, "fiducial-cdr", "fiducial_cdr_label_match"));
  }

  // ---- Bilan actif Fiducial ----
  for (const [field, value] of bilanActifValues) {
    values[field] = value;
    traces.push(
      buildTrace(field, value, "fiducial-bilan-actif", "fiducial_bilan_actif_label_match")
    );
  }

  // ---- Bilan passif Fiducial ----
  for (const [field, value] of bilanPassifValues) {
    values[field] = value;
    traces.push(
      buildTrace(field, value, "fiducial-bilan-passif", "fiducial_bilan_passif_label_match")
    );
  }

  if (isFiducialDebugEnabled()) {
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

function isFiducialDebugEnabled(): boolean {
  return process.env.FIDUCIAL_DEBUG === "true";
}

function logPreExtractionSnapshot(rows: readonly ReconstructedRow[]): void {
  const sectionCounts = rows.reduce(
    (acc, row) => {
      acc[row.section] = (acc[row.section] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  console.info("[fiducial] pre-extraction rows summary", {
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
  console.info("[fiducial] post-extraction values", {
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
