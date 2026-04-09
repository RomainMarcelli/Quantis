import type { FinancialFieldKey, ParsedFinancialData } from "@/services/pdf-analysis/types";

export function mapFieldValuesToParsedData(values: Record<FinancialFieldKey, number | null>): ParsedFinancialData {
  const parsed: ParsedFinancialData = {
    incomeStatement: {
      salesGoods: values.salesGoods,
      productionSoldGoods: values.productionSoldGoods,
      productionSoldServices: values.productionSoldServices,
      productionSold: values.productionSold,
      netTurnover: values.netTurnover,
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
      totalFixedAssets: values.totalFixedAssets,
      totalCurrentAssets: values.totalCurrentAssets,
      inventoriesGoods: values.inventoriesGoods,
      tradeReceivables: values.tradeReceivables,
      otherReceivables: values.otherReceivables,
      cashAndCashEquivalents: values.cashAndCashEquivalents,
      prepaidExpenses: values.prepaidExpenses,
      totalAssets: values.totalAssets,
      equity: values.equity,
      provisions: values.provisions,
      debts: values.debts,
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
