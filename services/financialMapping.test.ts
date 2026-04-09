import { describe, expect, it } from "vitest";
import { mapToQuantisData } from "@/services/financialMapping";
import type { ParsedFinancialData } from "@/services/pdfAnalysis";

describe("mapToQuantisData", () => {
  it("mappe les donnees financieres vers le format Quantis", () => {
    const sampleFinancialData = createFinancialData({
      incomeStatement: {
        netTurnover: 1200000,
        totalCharges: 900000,
        netResult: 300000
      },
      balanceSheet: {
        totalAssets: 5000000,
        equity: 2000000,
        debts: 3000000
      }
    });

    expect(mapToQuantisData(sampleFinancialData)).toEqual({
      ca: 1200000,
      totalCharges: 900000,
      netResult: 300000,
      totalAssets: 5000000,
      equity: 2000000,
      debts: 3000000
    });
  });

  it("utilise la decomposition du CA quand le netTurnover est absent", () => {
    const sampleFinancialData = createFinancialData({
      incomeStatement: {
        salesGoods: 700000,
        productionSoldGoods: 300000,
        productionSoldServices: 200000
      }
    });

    expect(mapToQuantisData(sampleFinancialData).ca).toBe(1200000);
  });

  it("utilise totalOperatingCharges en fallback", () => {
    const sampleFinancialData = createFinancialData({
      incomeStatement: {
        totalCharges: null,
        totalOperatingCharges: 650000
      }
    });

    expect(mapToQuantisData(sampleFinancialData).totalCharges).toBe(650000);
  });

  it("retourne null sur les champs absents", () => {
    const sampleFinancialData = createFinancialData();

    expect(mapToQuantisData(sampleFinancialData)).toEqual({
      ca: null,
      totalCharges: null,
      netResult: null,
      totalAssets: null,
      equity: null,
      debts: null
    });
  });
});

function createFinancialData(
  overrides?: {
    incomeStatement?: Partial<ParsedFinancialData["incomeStatement"]>;
    balanceSheet?: Partial<ParsedFinancialData["balanceSheet"]>;
  }
): ParsedFinancialData {
  const base: ParsedFinancialData = {
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

  return {
    incomeStatement: {
      ...base.incomeStatement,
      ...overrides?.incomeStatement
    },
    balanceSheet: {
      ...base.balanceSheet,
      ...overrides?.balanceSheet
    }
  };
}
