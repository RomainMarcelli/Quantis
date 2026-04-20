import type {
  FieldSelectionTrace,
  FinancialExtractionDiagnostics,
  FinancialFieldKey,
  ParsedFinancialData
} from "@/services/pdf-analysis/types";

const CRITICAL_FIELDS: FinancialFieldKey[] = [
  "netTurnover",
  "totalOperatingCharges",
  "netResult",
  "totalAssets",
  "equity",
  "debts"
];

export function buildDiagnostics(input: {
  parsedFinancialData: ParsedFinancialData;
  traces: FieldSelectionTrace[];
}): FinancialExtractionDiagnostics {
  const { parsedFinancialData, traces } = input;
  const warnings: string[] = [];
  const fieldScores: Record<string, number> = {};

  traces.forEach((trace) => {
    fieldScores[trace.field] = toFieldScore(trace.selected?.score ?? 0);
  });

  const traceByField = Object.fromEntries(traces.map((trace) => [trace.field, trace])) as Partial<
    Record<FinancialFieldKey, FieldSelectionTrace>
  >;
  const consistencyChecks = runConsistencyChecks(parsedFinancialData, traceByField);
  consistencyChecks.forEach((check) => {
    if (check.status === "warning") {
      warnings.push(check.message);
    }
  });

  const missingCritical = CRITICAL_FIELDS.filter((field) => getFieldValue(parsedFinancialData, field) === null);
  missingCritical.forEach((field) => {
    warnings.push(`Champ critique non trouve: ${field}.`);
  });

  const confidenceScore = computeConfidenceScore({
    parsedFinancialData,
    fieldScores,
    consistencyChecks,
    missingCriticalCount: missingCritical.length
  });

  return {
    confidenceScore,
    warnings: uniqueStrings(warnings),
    fieldScores,
    consistencyChecks
  };
}

function runConsistencyChecks(
  parsed: ParsedFinancialData,
  traceByField: Partial<Record<FinancialFieldKey, FieldSelectionTrace>>
): Array<{
  name: string;
  status: "ok" | "warning";
  message: string;
}> {
  const checks: Array<{ name: string; status: "ok" | "warning"; message: string }> = [];

  const totalAssets = parsed.balanceSheet.totalAssets;
  const totalLiabilities = parsed.balanceSheet.totalLiabilities;
  if (totalAssets !== null && totalLiabilities !== null) {
    const ratio = relativeDelta(totalAssets, totalLiabilities);
    checks.push(
      ratio <= 0.05
        ? { name: "assets_vs_liabilities", status: "ok", message: "Total actif proche du total passif." }
        : {
            name: "assets_vs_liabilities",
            status: "warning",
            message: `Ecart actif/passif eleve (${Math.round(ratio * 100)}%).`
          }
    );
  }

  const equity = parsed.balanceSheet.equity;
  const debts = parsed.balanceSheet.debts;
  if (totalAssets !== null && equity !== null && debts !== null) {
    const aggregate = equity + debts;
    const ratio = relativeDelta(totalAssets, aggregate);
    checks.push(
      ratio <= 0.08
        ? { name: "assets_vs_equity_debts", status: "ok", message: "Actif coherent avec capitaux propres + dettes." }
        : {
            name: "assets_vs_equity_debts",
            status: "warning",
            message: "Actif non coherent avec capitaux propres + dettes."
          }
    );
  }

  const totalProducts = parsed.incomeStatement.totalProducts;
  const totalCharges = parsed.incomeStatement.totalCharges;
  const netResult = parsed.incomeStatement.netResult;
  const shouldRunNetCheck = shouldRunNetResultConsistencyCheck({
    totalProducts,
    totalCharges,
    netResult,
    totalProductsTrace: traceByField.totalProducts,
    totalChargesTrace: traceByField.totalCharges
  });
  if (shouldRunNetCheck && totalProducts !== null && totalCharges !== null && netResult !== null) {
    const simulated = totalProducts - totalCharges;
    const ratio = relativeDelta(simulated, netResult);
    checks.push(
      ratio <= 0.12
        ? { name: "income_consistency", status: "ok", message: "Resultat net coherent avec total produits/charges." }
        : {
            name: "income_consistency",
            status: "warning",
            message: "Resultat net semble incoherent avec total produits/charges."
          }
    );
  }

  if (parsed.incomeStatement.netTurnover !== null && parsed.incomeStatement.netTurnover < 0) {
    checks.push({
      name: "negative_turnover",
      status: "warning",
      message: "Chiffre d'affaires negatif detecte."
    });
  }

  return checks;
}

function shouldRunNetResultConsistencyCheck(input: {
  totalProducts: number | null;
  totalCharges: number | null;
  netResult: number | null;
  totalProductsTrace?: FieldSelectionTrace;
  totalChargesTrace?: FieldSelectionTrace;
}): boolean {
  const {
    totalProducts,
    totalCharges,
    netResult,
    totalProductsTrace,
    totalChargesTrace
  } = input;

  if (totalProducts === null || totalCharges === null || netResult === null) {
    return false;
  }

  if (!totalProductsTrace?.selected || !totalChargesTrace?.selected) {
    return false;
  }

  const productsLabel = normalize(totalProductsTrace?.selected?.rowText ?? "");
  const chargesLabel = normalize(totalChargesTrace?.selected?.rowText ?? "");
  const hasSecondaryTotals = [
    "exploitation",
    "financier",
    "financiers",
    "financiere",
    "financieres",
    "exceptionnel",
    "exceptionnels",
    "exceptionnelle",
    "exceptionnelles"
  ].some((keyword) => productsLabel.includes(keyword) || chargesLabel.includes(keyword));

  return !hasSecondaryTotals;
}

function computeConfidenceScore(input: {
  parsedFinancialData: ParsedFinancialData;
  fieldScores: Record<string, number>;
  consistencyChecks: Array<{ status: "ok" | "warning" }>;
  missingCriticalCount: number;
}): number {
  const { parsedFinancialData, fieldScores, consistencyChecks, missingCriticalCount } = input;

  const allValues = [
    ...Object.values(parsedFinancialData.incomeStatement),
    ...Object.values(parsedFinancialData.balanceSheet)
  ];
  const foundCount = allValues.filter((value) => value !== null).length;
  const coverageScore = foundCount / Math.max(1, allValues.length);

  const avgFieldScore =
    Object.values(fieldScores).reduce((sum, value) => sum + value, 0) / Math.max(1, Object.values(fieldScores).length);

  const warningCount = consistencyChecks.filter((check) => check.status === "warning").length;
  const consistencyPenalty = warningCount * 0.05 + missingCriticalCount * 0.06;

  const blended = coverageScore * 0.45 + avgFieldScore * 0.45 + Math.max(0, 1 - consistencyPenalty) * 0.1;
  return clamp01(blended);
}

function toFieldScore(rawScore: number): number {
  if (!Number.isFinite(rawScore) || rawScore <= 0) {
    return 0;
  }

  if (rawScore >= 250) {
    return 1;
  }

  return Number((rawScore / 250).toFixed(2));
}

function relativeDelta(left: number, right: number): number {
  const denominator = Math.max(1, Math.abs(right));
  return Math.abs(left - right) / denominator;
}

function clamp01(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  return Number(clamped.toFixed(2));
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function getFieldValue(parsed: ParsedFinancialData, key: FinancialFieldKey): number | null {
  if (key in parsed.incomeStatement) {
    return parsed.incomeStatement[key as keyof ParsedFinancialData["incomeStatement"]] as number | null;
  }
  return parsed.balanceSheet[key as keyof ParsedFinancialData["balanceSheet"]] as number | null;
}
