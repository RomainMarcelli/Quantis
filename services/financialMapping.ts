import type { ParsedFinancialData } from "@/services/pdfAnalysis";

export type VyzorFinancialData = {
  ca: number | null;
  totalCharges: number | null;
  netResult: number | null;
  totalAssets: number | null;
  equity: number | null;
  debts: number | null;
};

export function mapToVyzorData(financialData: ParsedFinancialData): VyzorFinancialData {
  const turnover = safeNumber(financialData.incomeStatement.netTurnover);
  const salesGoods = safeNumber(financialData.incomeStatement.salesGoods);
  const productionGoods = safeNumber(financialData.incomeStatement.productionSoldGoods);
  const productionServices = safeNumber(financialData.incomeStatement.productionSoldServices);
  const legacyRevenue = safeNumber(financialData.incomeStatement.revenue);
  const legacyProduction = safeNumber(financialData.incomeStatement.production);

  const quantisData: VyzorFinancialData = {
    ca: computeCa({
      turnover,
      salesGoods,
      productionGoods,
      productionServices,
      legacyRevenue,
      legacyProduction
    }),
    totalCharges: selectVyzorTotalCharges(financialData),
    netResult: safeNumber(financialData.incomeStatement.netResult),
    totalAssets: safeNumber(financialData.balanceSheet.totalAssets),
    equity: safeNumber(financialData.balanceSheet.equity),
    debts: safeNumber(financialData.balanceSheet.debts)
  };

  const missingFieldsCount = Object.values(quantisData).filter((value) => value === null).length;
  console.info("[financial-mapping] Vyzor data computed", {
    missingFieldsCount,
    hasCa: quantisData.ca !== null
  });

  if (isPdfParserDebugEnabled()) {
    console.info("[financial-mapping] Vyzor payload", quantisData);
  }

  return quantisData;
}

function selectVyzorTotalCharges(financialData: ParsedFinancialData): number | null {
  const operatingCharges = safeNumber(financialData.incomeStatement.totalOperatingCharges);
  if (operatingCharges !== null) {
    return operatingCharges;
  }

  const totalCharges = safeNumber(financialData.incomeStatement.totalCharges);
  if (totalCharges === null) {
    return null;
  }

  const operatingProducts = safeNumber(financialData.incomeStatement.totalOperatingProducts);
  // Guard against selecting a global/ambiguous total when operating charges are missing.
  if (operatingProducts !== null && totalCharges > operatingProducts * 1.25) {
    return null;
  }

  return totalCharges;
}

function computeCa(input: {
  turnover: number | null;
  salesGoods: number | null;
  productionGoods: number | null;
  productionServices: number | null;
  legacyRevenue: number | null;
  legacyProduction: number | null;
}): number | null {
  const {
    turnover,
    salesGoods,
    productionGoods,
    productionServices,
    legacyRevenue,
    legacyProduction
  } = input;

  if (turnover !== null) {
    return turnover;
  }

  const decomposed = sumAvailable(salesGoods, productionGoods, productionServices);
  if (decomposed !== null) {
    return decomposed;
  }

  if (legacyRevenue !== null && legacyProduction !== null) {
    return legacyRevenue + legacyProduction;
  }
  if (legacyRevenue !== null) {
    return legacyRevenue;
  }
  if (legacyProduction !== null) {
    return legacyProduction;
  }

  return null;
}

function safeNumber(value: number | null): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function sumAvailable(...values: Array<number | null>): number | null {
  const presentValues = values.filter((value): value is number => value !== null);
  if (!presentValues.length) {
    return null;
  }
  return presentValues.reduce((sum, value) => sum + value, 0);
}

function isPdfParserDebugEnabled(): boolean {
  return process.env.PDF_PARSER_DEBUG === "true";
}
