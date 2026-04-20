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

  it("evite un fallback ambigu sur totalCharges global trop eleve", () => {
    const sampleFinancialData = createFinancialData({
      incomeStatement: {
        totalOperatingCharges: null,
        totalCharges: 9_020_949,
        totalOperatingProducts: 6_598_806
      }
    });

    expect(mapToQuantisData(sampleFinancialData).totalCharges).toBeNull();
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
      equity: null,
      provisions: null,
      borrowings: null,
      debts: null,
      advancesAndPrepaymentsLiabilities: null,
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
