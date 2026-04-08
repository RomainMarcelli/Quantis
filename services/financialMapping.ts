import type { ParsedFinancialData } from "@/services/pdfAnalysis";

export type QuantisFinancialData = {
  ca: number | null;
  totalCharges: number | null;
  netResult: number | null;
  totalAssets: number | null;
  equity: number | null;
  debts: number | null;
};

export function mapToQuantisData(financialData: ParsedFinancialData): QuantisFinancialData {
  const revenue = safeNumber(financialData.incomeStatement.revenue);
  const production = safeNumber(financialData.incomeStatement.production);

  const quantisData: QuantisFinancialData = {
    ca: computeCa(revenue, production),
    totalCharges: safeNumber(financialData.incomeStatement.totalCharges),
    netResult: safeNumber(financialData.incomeStatement.netResult),
    totalAssets: safeNumber(financialData.balanceSheet.totalAssets),
    equity: safeNumber(financialData.balanceSheet.equity),
    debts: safeNumber(financialData.balanceSheet.debts)
  };

  console.info("[financial-mapping] Quantis data computed", quantisData);

  return quantisData;
}

function computeCa(revenue: number | null, production: number | null): number | null {
  if (revenue !== null && production !== null) {
    return revenue + production;
  }
  if (revenue !== null) {
    return revenue;
  }
  if (production !== null) {
    return production;
  }
  return null;
}

function safeNumber(value: number | null): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}
