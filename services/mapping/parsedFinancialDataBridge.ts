import type { ParsedFinancialData } from "@/services/pdfAnalysis";
import type { MappedFinancialData } from "@/types/analysis";
import { createEmptyMappedFinancialData } from "@/services/mapping/financialDataMapper";

export function mapParsedFinancialDataToMappedFinancialData(
  financialData: ParsedFinancialData
): MappedFinancialData {
  const mapped = createEmptyMappedFinancialData();
  const { incomeStatement, balanceSheet } = financialData;
  const netTurnover = toNumber(incomeStatement.netTurnover);

  mapped.immob_incorp = toNumber(balanceSheet.intangibleAssets);
  mapped.immob_corp = toNumber(balanceSheet.tangibleAssets);
  mapped.immob_fin = toNumber(balanceSheet.financialAssets);
  mapped.total_actif_immo_brut = toNumber(balanceSheet.totalFixedAssetsGross);
  mapped.total_actif_immo = toNumber(balanceSheet.totalFixedAssets);
  mapped.total_actif_immo_net = toNumber(balanceSheet.totalFixedAssets);

  mapped.stocks_mp = toNumber(balanceSheet.rawMaterialInventories);
  mapped.stocks_march = toNumber(balanceSheet.inventoriesGoods);
  mapped.avances_vers_actif = toNumber(balanceSheet.advancesAndPrepaymentsAssets);
  mapped.total_stocks = coalesce(
    mapped.total_stocks,
    sumAvailable(mapped.stocks_mp, mapped.stocks_march)
  );

  mapped.clients = toNumber(balanceSheet.tradeReceivables);
  mapped.autres_creances = toNumber(balanceSheet.otherReceivables);
  mapped.vmp = toNumber(balanceSheet.marketableSecurities);
  mapped.creances = coalesce(
    mapped.creances,
    sumAvailable(mapped.clients, mapped.autres_creances)
  );

  mapped.dispo = toNumber(balanceSheet.cashAndCashEquivalents);
  mapped.cca = toNumber(balanceSheet.prepaidExpenses);
  mapped.total_actif_circ = toNumber(balanceSheet.totalCurrentAssets);
  mapped.total_actif = toNumber(balanceSheet.totalAssets);
  mapped.total_cp = toNumber(balanceSheet.equity);
  mapped.total_prov = toNumber(balanceSheet.provisions);
  mapped.emprunts = toNumber(balanceSheet.borrowings);
  mapped.avances_recues_passif = toNumber(balanceSheet.advancesAndPrepaymentsLiabilities);
  mapped.fournisseurs = toNumber(balanceSheet.tradePayables);
  mapped.dettes_fisc_soc = toNumber(balanceSheet.taxSocialPayables);
  mapped.autres_dettes = toNumber(balanceSheet.otherDebts);
  mapped.pca = toNumber(balanceSheet.deferredIncome);
  mapped.total_dettes = toNumber(balanceSheet.debts);
  mapped.total_passif = toNumber(balanceSheet.totalLiabilities);

  mapped.ventes_march = toNumber(incomeStatement.salesGoods);
  mapped.prod_biens = toNumber(incomeStatement.productionSoldGoods);
  mapped.prod_serv = toNumber(incomeStatement.productionSoldServices);
  mapped.prod_vendue = coalesce(
    toNumber(incomeStatement.productionSold),
    sumAvailable(mapped.prod_biens, mapped.prod_serv)
  );
  mapped.prod_vendue = sanitizeProductionSold(mapped.prod_vendue, netTurnover);
  mapped.ventes_march = coalesce(
    mapped.ventes_march,
    deriveSalesGoodsFromNetTurnover(netTurnover, mapped.prod_vendue)
  );
  mapped.total_prod_expl = toNumber(incomeStatement.totalOperatingProducts);
  mapped.autres_prod_expl = toNumber(incomeStatement.otherOperatingIncome);

  mapped.achats_march = toNumber(incomeStatement.purchasesGoods);
  mapped.var_stock_march = toNumber(incomeStatement.stockVariationGoods);
  mapped.achats_mp = toNumber(incomeStatement.rawMaterialPurchases);
  mapped.var_stock_mp = toNumber(incomeStatement.stockVariationRawMaterials);
  mapped.ace = toNumber(incomeStatement.externalCharges);
  mapped.impots_taxes = toNumber(incomeStatement.taxesAndLevies);
  mapped.salaires = toNumber(incomeStatement.wages);
  mapped.charges_soc = toNumber(incomeStatement.socialCharges);
  mapped.dap = toNumber(incomeStatement.depreciationAllocations);
  mapped.dprov = toNumber(incomeStatement.provisionsAllocations);
  mapped.autres_charges_expl = toNumber(incomeStatement.otherOperatingCharges);
  mapped.total_charges_expl = toNumber(incomeStatement.totalOperatingCharges);
  mapped.ebit = toNumber(incomeStatement.operatingResult);
  mapped.prod_fin = toNumber(incomeStatement.financialProducts);
  mapped.charges_fin = toNumber(incomeStatement.financialCharges);
  mapped.prod_excep = toNumber(incomeStatement.exceptionalProducts);
  mapped.charges_excep = toNumber(incomeStatement.exceptionalCharges);
  mapped.is_impot = toNumber(incomeStatement.incomeTax);

  mapped.res_net = toNumber(incomeStatement.netResult);
  mapped.resultat_exercice = coalesce(
    toNumber(incomeStatement.netResult),
    toNumber(incomeStatement.totalProducts !== null && incomeStatement.totalCharges !== null
      ? incomeStatement.totalProducts - incomeStatement.totalCharges
      : null)
  );

  mapped.total_charges_expl = coalesce(
    mapped.total_charges_expl,
    sumAvailable(
      mapped.achats_march,
      mapped.var_stock_march,
      mapped.achats_mp,
      mapped.var_stock_mp,
      mapped.ace,
      mapped.impots_taxes,
      mapped.salaires,
      mapped.charges_soc,
      mapped.dap
    )
  );

  mapped.n = coalesce(mapped.n, 1);
  return mapped;
}

function toNumber(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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

function sanitizeProductionSold(
  productionSold: number | null,
  netTurnover: number | null
): number | null {
  if (productionSold === null) {
    return null;
  }

  if (productionSold < 0) {
    return null;
  }

  if (netTurnover === null) {
    return productionSold;
  }

  if (productionSold > netTurnover * 1.15) {
    return null;
  }

  return productionSold;
}

function deriveSalesGoodsFromNetTurnover(
  netTurnover: number | null,
  productionSold: number | null
): number | null {
  if (netTurnover === null) {
    return null;
  }

  if (productionSold === null) {
    return netTurnover;
  }

  const derived = netTurnover - productionSold;
  if (derived >= 0) {
    return derived;
  }

  const tolerance = Math.max(1_000, netTurnover * 0.02);
  if (Math.abs(derived) <= tolerance) {
    return netTurnover;
  }

  return null;
}
