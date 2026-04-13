import type { FinancialFieldKey, ParsedFinancialData } from "@/services/pdf-analysis/types";

export function mapFieldValuesToParsedData(values: Record<FinancialFieldKey, number | null>): ParsedFinancialData {
  const parsed: ParsedFinancialData = {
    incomeStatement: {
      salesGoods: values.salesGoods,
      productionSoldGoods: values.productionSoldGoods,
      productionSoldServices: values.productionSoldServices,
      productionSold: values.productionSold,
      purchasesGoods: values.purchasesGoods,
      stockVariationGoods: values.stockVariationGoods,
      rawMaterialPurchases: values.rawMaterialPurchases,
      stockVariationRawMaterials: values.stockVariationRawMaterials,
      externalCharges: values.externalCharges,
      taxesAndLevies: values.taxesAndLevies,
      wages: values.wages,
      socialCharges: values.socialCharges,
      depreciationAllocations: values.depreciationAllocations,
      provisionsAllocations: values.provisionsAllocations,
      netTurnover: values.netTurnover,
      otherOperatingIncome: values.otherOperatingIncome,
      otherOperatingCharges: values.otherOperatingCharges,
      financialProducts: values.financialProducts,
      financialCharges: values.financialCharges,
      exceptionalProducts: values.exceptionalProducts,
      exceptionalCharges: values.exceptionalCharges,
      incomeTax: values.incomeTax,
      totalOperatingProducts: values.totalOperatingProducts,
      totalOperatingCharges: values.totalOperatingCharges,
      operatingResult: values.operatingResult,
      financialResult: values.financialResult,
      ordinaryResultBeforeTax: values.ordinaryResultBeforeTax,
      exceptionalResult: values.exceptionalResult,
      totalProducts: values.totalProducts,
      totalCharges: values.totalCharges,
      netResult: values.netResult,
      revenue: values.salesGoods,
      production: null
    },
    balanceSheet: {
      intangibleAssets: values.intangibleAssets,
      tangibleAssets: values.tangibleAssets,
      financialAssets: values.financialAssets,
      totalFixedAssetsGross: values.totalFixedAssetsGross,
      totalFixedAssets: values.totalFixedAssets,
      totalCurrentAssets: values.totalCurrentAssets,
      rawMaterialInventories: values.rawMaterialInventories,
      inventoriesGoods: values.inventoriesGoods,
      advancesAndPrepaymentsAssets: values.advancesAndPrepaymentsAssets,
      tradeReceivables: values.tradeReceivables,
      otherReceivables: values.otherReceivables,
      marketableSecurities: values.marketableSecurities,
      cashAndCashEquivalents: values.cashAndCashEquivalents,
      prepaidExpenses: values.prepaidExpenses,
      totalAssets: values.totalAssets,
      equity: values.equity,
      provisions: values.provisions,
      borrowings: values.borrowings,
      debts: values.debts,
      advancesAndPrepaymentsLiabilities: values.advancesAndPrepaymentsLiabilities,
      tradePayables: values.tradePayables,
      taxSocialPayables: values.taxSocialPayables,
      otherDebts: values.otherDebts,
      deferredIncome: values.deferredIncome,
      totalLiabilities: values.totalLiabilities,
      totalAssetDepreciationProvisions: values.totalAssetDepreciationProvisions,
      shortTermBankDebt: values.shortTermBankDebt,
      longTermBankDebt: values.longTermBankDebt
    }
  };

  parsed.incomeStatement.production = coalesce(
    parsed.incomeStatement.productionSold,
    sumAvailable(parsed.incomeStatement.productionSoldGoods, parsed.incomeStatement.productionSoldServices)
  );

  parsed.incomeStatement.netTurnover = coalesce(
    parsed.incomeStatement.netTurnover,
    sumAvailable(
      parsed.incomeStatement.salesGoods,
      parsed.incomeStatement.productionSoldGoods,
      parsed.incomeStatement.productionSoldServices
    )
  );

  parsed.incomeStatement.totalProducts = coalesce(
    parsed.incomeStatement.totalProducts,
    parsed.incomeStatement.totalOperatingProducts
  );
  parsed.incomeStatement.totalCharges = coalesce(
    parsed.incomeStatement.totalOperatingCharges,
    parsed.incomeStatement.totalCharges
  );

  parsed.balanceSheet.totalLiabilities = coalesce(
    parsed.balanceSheet.totalLiabilities,
    sumAvailable(parsed.balanceSheet.equity, parsed.balanceSheet.provisions, parsed.balanceSheet.debts)
  );

  parsed.balanceSheet.debts = coalesce(
    parsed.balanceSheet.debts,
    sumAvailable(
      parsed.balanceSheet.borrowings,
      parsed.balanceSheet.tradePayables,
      parsed.balanceSheet.taxSocialPayables,
      parsed.balanceSheet.otherDebts,
      parsed.balanceSheet.shortTermBankDebt,
      parsed.balanceSheet.longTermBankDebt
    )
  );

  return parsed;
}

function coalesce(...values: Array<number | null>): number | null {
  return values.find((value) => value !== null) ?? null;
}

function sumAvailable(...values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  if (!present.length) {
    return null;
  }
  return present.reduce((sum, value) => sum + value, 0);
}
