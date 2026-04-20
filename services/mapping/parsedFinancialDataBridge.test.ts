import { describe, expect, it } from "vitest";
import type { ParsedFinancialData } from "@/services/pdfAnalysis";
import { mapParsedFinancialDataToMappedFinancialData } from "@/services/mapping/parsedFinancialDataBridge";

describe("parsedFinancialDataBridge", () => {
  it("maps lot 1 fields to mapped financial data", () => {
    const parsed: ParsedFinancialData = createParsedFinancialData({
      incomeStatement: {
        salesGoods: 1_200_000,
        productionSoldGoods: 300_000,
        productionSoldServices: 200_000,
        purchasesGoods: 250_000,
        stockVariationGoods: -10_000,
        rawMaterialPurchases: 120_000,
        stockVariationRawMaterials: 4_500,
        externalCharges: 180_000,
        taxesAndLevies: 30_000,
        wages: 220_000,
        socialCharges: 95_000,
        depreciationAllocations: 45_000,
        provisionsAllocations: 11_000,
        otherOperatingIncome: 20_000,
        otherOperatingCharges: 9_000,
        financialProducts: 8_000,
        financialCharges: 6_500,
        exceptionalProducts: 4_000,
        exceptionalCharges: 5_000,
        incomeTax: 3_000,
        totalOperatingProducts: 2_050_000,
        totalOperatingCharges: 1_760_000,
        operatingResult: 290_000,
        netResult: 120_000
      },
      balanceSheet: {
        totalFixedAssetsGross: 1_320_000,
        totalFixedAssets: 690_000,
        rawMaterialInventories: 80_000,
        inventoriesGoods: 65_000,
        advancesAndPrepaymentsAssets: 12_000,
        tradeReceivables: 210_000,
        otherReceivables: 35_000,
        marketableSecurities: 55_000,
        cashAndCashEquivalents: 140_000,
        totalCurrentAssets: 530_000,
        totalAssets: 2_300_000,
        equity: 900_000,
        borrowings: 350_000,
        debts: 1_020_000,
        advancesAndPrepaymentsLiabilities: 21_000,
        tradePayables: 260_000,
        taxSocialPayables: 170_000,
        totalLiabilities: 2_300_000
      }
    });

    const mapped = mapParsedFinancialDataToMappedFinancialData(parsed);

    expect(mapped.achats_march).toBe(250_000);
    expect(mapped.achats_mp).toBe(120_000);
    expect(mapped.var_stock_march).toBe(-10_000);
    expect(mapped.var_stock_mp).toBe(4_500);
    expect(mapped.ace).toBe(180_000);
    expect(mapped.impots_taxes).toBe(30_000);
    expect(mapped.salaires).toBe(220_000);
    expect(mapped.charges_soc).toBe(95_000);
    expect(mapped.dap).toBe(45_000);
    expect(mapped.dprov).toBe(11_000);
    expect(mapped.autres_prod_expl).toBe(20_000);
    expect(mapped.autres_charges_expl).toBe(9_000);
    expect(mapped.prod_fin).toBe(8_000);
    expect(mapped.charges_fin).toBe(6_500);
    expect(mapped.prod_excep).toBe(4_000);
    expect(mapped.charges_excep).toBe(5_000);
    expect(mapped.is_impot).toBe(3_000);

    expect(mapped.stocks_mp).toBe(80_000);
    expect(mapped.stocks_march).toBe(65_000);
    expect(mapped.avances_vers_actif).toBe(12_000);
    expect(mapped.vmp).toBe(55_000);
    expect(mapped.total_stocks).toBe(145_000);

    expect(mapped.emprunts).toBe(350_000);
    expect(mapped.avances_recues_passif).toBe(21_000);
    expect(mapped.res_net).toBe(120_000);
    expect(mapped.resultat_exercice).toBe(120_000);
    expect(mapped.prod_vendue).toBe(500_000);
    expect(mapped.creances).toBe(245_000);
    expect(mapped.total_actif_immo_brut).toBe(1_320_000);
    expect(mapped.total_actif_immo_net).toBe(690_000);
  });

  it("accepte un prod_vendue negatif de faible amplitude et derive ventes_march correctement", () => {
    // Bug 5 (Lot 3) : prod_vendue négatif de faible amplitude (ex : -7 031 sur BEL AIR)
    // doit être conservé — ventes_march = netTurnover - prod_vendue
    const parsed = createParsedFinancialData({
      incomeStatement: {
        netTurnover: 3_370_595,
        productionSold: -7_105,
        salesGoods: null,
        productionSoldGoods: null,
        productionSoldServices: null
      }
    });

    const mapped = mapParsedFinancialDataToMappedFinancialData(parsed);
    expect(mapped.prod_vendue).toBe(-7_105);
    expect(mapped.ventes_march).toBe(3_377_700); // 3_370_595 - (-7_105)
  });
});

function createParsedFinancialData(overrides?: {
  incomeStatement?: Partial<ParsedFinancialData["incomeStatement"]>;
  balanceSheet?: Partial<ParsedFinancialData["balanceSheet"]>;
}): ParsedFinancialData {
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
