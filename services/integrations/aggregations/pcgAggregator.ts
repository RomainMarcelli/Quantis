// Agrège des écritures comptables (modèle interne) en ParsedFinancialData (format pivot existant).
// On réutilise ensuite parsedFinancialDataBridge pour produire un MappedFinancialData,
// puis l'engine KPI existant — exactement la même chaîne que la voie PDF.
//
// Convention PCG :
//  - Comptes 6xx (charges) : valeur = debit - credit (positif = expense réelle)
//  - Comptes 7xx (produits) : valeur = credit - debit (positif = revenu réel)
//  - Actifs (classes 2-3-5 + 41x débitrices) : valeur = debit - credit (positif = actif)
//  - Passifs (classes 1-4 créditrices, 16-17) : valeur = credit - debit (positif = passif)
//
// LIMITATION CONNUE Phase 1 : le bilan calculé à partir d'écritures depuis `periodStart`
// ne donne pas de vrai solde de bilan (il manque l'à-nouveau / opening balance).
// Pour avoir un bilan exact, il faudra fetcher la balance générale via un endpoint Pennylane
// dédié ou ingérer l'à-nouveau du début d'exercice. Aujourd'hui les KPI bilan dérivés
// (BFR, solvabilité, liquidités) sont des approximations.

import { createEmptyParsedFinancialData } from "@/services/pdf-analysis/types";
import type { ParsedFinancialData } from "@/services/pdf-analysis/types";
import type { AccountingEntry } from "@/types/connectors";

type IncomeStatementField = keyof ParsedFinancialData["incomeStatement"];
type BalanceSheetField = keyof ParsedFinancialData["balanceSheet"];

type ISMapping = { prefix: string; field: IncomeStatementField; sign: "credit" | "debit" };
type BSMapping = { prefix: string; field: BalanceSheetField; sign: "asset" | "liability" };

// Compte de résultat — préfixes PCG → champ ParsedFinancialData.
// Préfixes plus longs prioritaires (ex. "641" l'emporte sur "64").
const INCOME_STATEMENT_MAPPING: ISMapping[] = [
  // Produits (classe 7)
  { prefix: "707", field: "salesGoods", sign: "credit" },
  { prefix: "701", field: "productionSoldGoods", sign: "credit" },
  { prefix: "702", field: "productionSoldGoods", sign: "credit" },
  { prefix: "703", field: "productionSoldGoods", sign: "credit" },
  { prefix: "704", field: "productionSoldGoods", sign: "credit" },
  { prefix: "705", field: "productionSoldGoods", sign: "credit" },
  { prefix: "706", field: "productionSoldServices", sign: "credit" },
  { prefix: "708", field: "productionSoldServices", sign: "credit" },
  { prefix: "709", field: "productionSoldServices", sign: "debit" }, // RRR accordés → réduisent le CA
  { prefix: "713", field: "productionStored", sign: "credit" },
  { prefix: "72", field: "productionCapitalized", sign: "credit" },
  { prefix: "74", field: "operatingSubsidies", sign: "credit" },
  { prefix: "75", field: "otherOperatingIncome", sign: "credit" },
  { prefix: "76", field: "financialProducts", sign: "credit" },
  { prefix: "77", field: "exceptionalProducts", sign: "credit" },
  { prefix: "78", field: "otherOperatingIncome", sign: "credit" }, // reprises sur amort/prov
  { prefix: "79", field: "otherOperatingIncome", sign: "credit" }, // transferts de charges

  // Charges (classe 6)
  { prefix: "607", field: "purchasesGoods", sign: "debit" },
  { prefix: "609", field: "purchasesGoods", sign: "credit" }, // RRR obtenus sur achats marchandises
  { prefix: "601", field: "rawMaterialPurchases", sign: "debit" },
  { prefix: "602", field: "rawMaterialPurchases", sign: "debit" },
  { prefix: "604", field: "externalCharges", sign: "debit" }, // achats études/prestations
  { prefix: "605", field: "externalCharges", sign: "debit" },
  { prefix: "606", field: "externalCharges", sign: "debit" },
  { prefix: "608", field: "externalCharges", sign: "debit" },
  { prefix: "6037", field: "stockVariationGoods", sign: "debit" },
  { prefix: "6031", field: "stockVariationRawMaterials", sign: "debit" },
  { prefix: "61", field: "externalCharges", sign: "debit" },
  { prefix: "62", field: "externalCharges", sign: "debit" },
  { prefix: "63", field: "taxesAndLevies", sign: "debit" },
  { prefix: "641", field: "wages", sign: "debit" },
  { prefix: "644", field: "wages", sign: "debit" },
  { prefix: "648", field: "wages", sign: "debit" },
  { prefix: "645", field: "socialCharges", sign: "debit" },
  { prefix: "646", field: "socialCharges", sign: "debit" },
  { prefix: "647", field: "socialCharges", sign: "debit" },
  { prefix: "65", field: "otherOperatingCharges", sign: "debit" },
  { prefix: "66", field: "financialCharges", sign: "debit" },
  { prefix: "67", field: "exceptionalCharges", sign: "debit" },
  { prefix: "681", field: "depreciationAllocations", sign: "debit" },
  { prefix: "686", field: "depreciationAllocations", sign: "debit" },
  { prefix: "687", field: "depreciationAllocations", sign: "debit" },
  { prefix: "685", field: "provisionsAllocations", sign: "debit" },
  { prefix: "691", field: "incomeTax", sign: "debit" },
  { prefix: "695", field: "incomeTax", sign: "debit" },
  { prefix: "697", field: "incomeTax", sign: "debit" },
  { prefix: "698", field: "incomeTax", sign: "debit" },
  { prefix: "699", field: "incomeTax", sign: "credit" }, // produits IS (négatif sur l'IS)
];

// Bilan — préfixes PCG → champ. Les valeurs sont cumulées (closing balance).
const BALANCE_SHEET_MAPPING: BSMapping[] = [
  // Capitaux propres
  { prefix: "10", field: "shareCapital", sign: "liability" },
  { prefix: "1051", field: "revaluationDifferences", sign: "liability" },
  { prefix: "1061", field: "legalReserves", sign: "liability" },
  { prefix: "1063", field: "regulatoryReserves", sign: "liability" },
  { prefix: "1068", field: "otherReserves", sign: "liability" },
  { prefix: "11", field: "retainedEarnings", sign: "liability" },
  { prefix: "13", field: "investmentSubsidies", sign: "liability" },
  { prefix: "14", field: "regulatoryProvisions", sign: "liability" },
  { prefix: "15", field: "provisions", sign: "liability" },
  // Emprunts et dettes
  { prefix: "16", field: "borrowings", sign: "liability" },
  { prefix: "17", field: "debts", sign: "liability" },
  { prefix: "18", field: "advancesAndPrepaymentsLiabilities", sign: "liability" },
  // Actif immobilisé
  { prefix: "20", field: "intangibleAssets", sign: "asset" },
  { prefix: "21", field: "tangibleAssets", sign: "asset" },
  { prefix: "23", field: "tangibleAssets", sign: "asset" },
  { prefix: "26", field: "financialAssets", sign: "asset" },
  { prefix: "27", field: "financialAssets", sign: "asset" },
  { prefix: "28", field: "totalAssetDepreciationProvisions", sign: "liability" }, // amort cumulés
  { prefix: "29", field: "totalAssetDepreciationProvisions", sign: "liability" }, // dépréc cumulées
  // Stocks
  { prefix: "31", field: "rawMaterialInventories", sign: "asset" },
  { prefix: "32", field: "rawMaterialInventories", sign: "asset" },
  { prefix: "33", field: "rawMaterialInventories", sign: "asset" },
  { prefix: "34", field: "rawMaterialInventories", sign: "asset" },
  { prefix: "35", field: "inventoriesGoods", sign: "asset" },
  { prefix: "37", field: "inventoriesGoods", sign: "asset" },
  // Tiers
  { prefix: "401", field: "tradePayables", sign: "liability" },
  { prefix: "403", field: "tradePayables", sign: "liability" },
  { prefix: "404", field: "tradePayables", sign: "liability" },
  { prefix: "405", field: "tradePayables", sign: "liability" },
  { prefix: "408", field: "tradePayables", sign: "liability" }, // FNP
  { prefix: "409", field: "advancesAndPrepaymentsAssets", sign: "asset" },
  { prefix: "411", field: "tradeReceivables", sign: "asset" },
  { prefix: "413", field: "tradeReceivables", sign: "asset" },
  { prefix: "416", field: "tradeReceivables", sign: "asset" },
  { prefix: "418", field: "tradeReceivables", sign: "asset" }, // CAR
  { prefix: "419", field: "advancesAndPrepaymentsLiabilities", sign: "liability" },
  { prefix: "42", field: "taxSocialPayables", sign: "liability" },
  { prefix: "43", field: "taxSocialPayables", sign: "liability" },
  { prefix: "44", field: "taxSocialPayables", sign: "liability" },
  { prefix: "455", field: "associatesCurrentAccounts", sign: "liability" },
  { prefix: "467", field: "otherDebts", sign: "liability" },
  { prefix: "468", field: "otherReceivables", sign: "asset" },
  { prefix: "486", field: "prepaidExpenses", sign: "asset" },
  { prefix: "487", field: "deferredIncome", sign: "liability" },
  // Trésorerie
  { prefix: "50", field: "marketableSecurities", sign: "asset" },
  { prefix: "51", field: "cashAndCashEquivalents", sign: "asset" },
  { prefix: "519", field: "shortTermBankDebt", sign: "liability" },
  { prefix: "52", field: "cashAndCashEquivalents", sign: "asset" },
  { prefix: "53", field: "cashAndCashEquivalents", sign: "asset" },
  { prefix: "54", field: "cashAndCashEquivalents", sign: "asset" },
];

// Tri par longueur de préfixe décroissante : on cherche toujours le match le plus spécifique.
const IS_MAPPING_SORTED = [...INCOME_STATEMENT_MAPPING].sort(
  (a, b) => b.prefix.length - a.prefix.length
);
const BS_MAPPING_SORTED = [...BALANCE_SHEET_MAPPING].sort(
  (a, b) => b.prefix.length - a.prefix.length
);

function findISMapping(accountNumber: string): ISMapping | null {
  for (const m of IS_MAPPING_SORTED) {
    if (accountNumber.startsWith(m.prefix)) return m;
  }
  return null;
}

function findBSMapping(accountNumber: string): BSMapping | null {
  for (const m of BS_MAPPING_SORTED) {
    if (accountNumber.startsWith(m.prefix)) return m;
  }
  return null;
}

export type AggregatorOptions = {
  periodStart: Date;
  periodEnd: Date;
  // Période N-1 pour pouvoir renseigner ca_n_minus_1 sans deuxième sync.
  previousPeriodStart?: Date;
  previousPeriodEnd?: Date;
};

export function aggregateEntriesToParsedFinancialData(
  entries: AccountingEntry[],
  options: AggregatorOptions
): ParsedFinancialData {
  const result = createEmptyParsedFinancialData();
  const incomeStatement = result.incomeStatement;
  const balanceSheet = result.balanceSheet;

  const periodStartMs = options.periodStart.getTime();
  const periodEndMs = options.periodEnd.getTime();
  const prevStartMs = options.previousPeriodStart?.getTime() ?? null;
  const prevEndMs = options.previousPeriodEnd?.getTime() ?? null;

  let prevTurnover = 0;
  let hasPrevPeriodEntries = false;
  let skippedEntriesNoDate = 0;
  let skippedLinesNoAccount = 0;
  let skippedLinesNonFinite = 0;

  for (const entry of entries) {
    const entryDate = new Date(entry.date).getTime();
    if (Number.isNaN(entryDate)) {
      skippedEntriesNoDate++;
      continue;
    }

    const inPeriod = entryDate >= periodStartMs && entryDate <= periodEndMs;
    const inPrevPeriod =
      prevStartMs !== null && prevEndMs !== null && entryDate >= prevStartMs && entryDate <= prevEndMs;
    const upToPeriodEnd = entryDate <= periodEndMs;

    if (!Array.isArray(entry.lines)) continue;

    for (const line of entry.lines) {
      const accountNumber = (line.accountNumber || "").trim();
      if (!accountNumber) {
        skippedLinesNoAccount++;
        continue;
      }
      // Si debit/credit ne sont pas finis (NaN, Infinity, undefined-cast), on skip la ligne.
      const debit = Number.isFinite(line.debit) ? line.debit : NaN;
      const credit = Number.isFinite(line.credit) ? line.credit : NaN;
      if (Number.isNaN(debit) || Number.isNaN(credit)) {
        skippedLinesNonFinite++;
        continue;
      }

      // Compte de résultat : net du mouvement de la période.
      if (inPeriod) {
        const isMapping = findISMapping(accountNumber);
        if (isMapping) {
          const value = isMapping.sign === "credit" ? credit - debit : debit - credit;
          const current = incomeStatement[isMapping.field] ?? 0;
          incomeStatement[isMapping.field] = current + value;
        }
      }

      // CA N-1 : on isole les comptes 70x sur la période précédente.
      if (inPrevPeriod && accountNumber.startsWith("70")) {
        prevTurnover += credit - debit;
        hasPrevPeriodEntries = true;
      }

      // Bilan : cumul jusqu'à periodEnd (approximation Phase 1, voir limitation en tête de fichier).
      if (upToPeriodEnd) {
        const bsMapping = findBSMapping(accountNumber);
        if (bsMapping) {
          const value = bsMapping.sign === "asset" ? debit - credit : credit - debit;
          const current = balanceSheet[bsMapping.field] ?? 0;
          balanceSheet[bsMapping.field] = current + value;
        }
      }
    }
  }

  if (skippedEntriesNoDate > 0 || skippedLinesNoAccount > 0 || skippedLinesNonFinite > 0) {
    console.warn(
      `[pcgAggregator] skipped: entries without date=${skippedEntriesNoDate}, lines without account=${skippedLinesNoAccount}, lines non-finite=${skippedLinesNonFinite}`
    );
  }

  // Calculs dérivés du compte de résultat.
  const salesGoods = incomeStatement.salesGoods ?? 0;
  const prodSoldGoods = incomeStatement.productionSoldGoods ?? 0;
  const prodSoldServices = incomeStatement.productionSoldServices ?? 0;
  const productionSold = prodSoldGoods + prodSoldServices;
  if (productionSold !== 0) {
    incomeStatement.productionSold = productionSold;
  }
  const netTurnover = salesGoods + productionSold;
  if (netTurnover !== 0) {
    incomeStatement.netTurnover = netTurnover;
    incomeStatement.revenue = netTurnover;
  }
  const production =
    productionSold +
    (incomeStatement.productionStored ?? 0) +
    (incomeStatement.productionCapitalized ?? 0);
  if (production !== 0) {
    incomeStatement.production = production;
  }

  // Total produits exploitation.
  const totalOperatingProducts =
    salesGoods +
    productionSold +
    (incomeStatement.productionStored ?? 0) +
    (incomeStatement.productionCapitalized ?? 0) +
    (incomeStatement.operatingSubsidies ?? 0) +
    (incomeStatement.otherOperatingIncome ?? 0);
  if (totalOperatingProducts !== 0) {
    incomeStatement.totalOperatingProducts = totalOperatingProducts;
  }

  // Total charges exploitation.
  const totalOperatingCharges =
    (incomeStatement.purchasesGoods ?? 0) +
    (incomeStatement.stockVariationGoods ?? 0) +
    (incomeStatement.rawMaterialPurchases ?? 0) +
    (incomeStatement.stockVariationRawMaterials ?? 0) +
    (incomeStatement.externalCharges ?? 0) +
    (incomeStatement.taxesAndLevies ?? 0) +
    (incomeStatement.wages ?? 0) +
    (incomeStatement.socialCharges ?? 0) +
    (incomeStatement.depreciationAllocations ?? 0) +
    (incomeStatement.provisionsAllocations ?? 0) +
    (incomeStatement.otherOperatingCharges ?? 0);
  if (totalOperatingCharges !== 0) {
    incomeStatement.totalOperatingCharges = totalOperatingCharges;
  }

  // Résultats intermédiaires.
  const operatingResult = totalOperatingProducts - totalOperatingCharges;
  if (operatingResult !== 0) {
    incomeStatement.operatingResult = operatingResult;
  }
  const financialResult =
    (incomeStatement.financialProducts ?? 0) - (incomeStatement.financialCharges ?? 0);
  if (financialResult !== 0) {
    incomeStatement.financialResult = financialResult;
  }
  const exceptionalResult =
    (incomeStatement.exceptionalProducts ?? 0) - (incomeStatement.exceptionalCharges ?? 0);
  if (exceptionalResult !== 0) {
    incomeStatement.exceptionalResult = exceptionalResult;
  }
  const ordinaryResultBeforeTax = operatingResult + financialResult;
  if (ordinaryResultBeforeTax !== 0) {
    incomeStatement.ordinaryResultBeforeTax = ordinaryResultBeforeTax;
  }
  const totalProducts =
    totalOperatingProducts +
    (incomeStatement.financialProducts ?? 0) +
    (incomeStatement.exceptionalProducts ?? 0);
  if (totalProducts !== 0) {
    incomeStatement.totalProducts = totalProducts;
  }
  const totalCharges =
    totalOperatingCharges +
    (incomeStatement.financialCharges ?? 0) +
    (incomeStatement.exceptionalCharges ?? 0) +
    (incomeStatement.incomeTax ?? 0);
  if (totalCharges !== 0) {
    incomeStatement.totalCharges = totalCharges;
  }
  const netResult = totalProducts - totalCharges;
  if (netResult !== 0) {
    incomeStatement.netResult = netResult;
  }

  // CA N-1.
  if (hasPrevPeriodEntries) {
    incomeStatement.netTurnoverPreviousYear = prevTurnover;
  }

  // Totaux bilan.
  const totalFixedAssets =
    (balanceSheet.intangibleAssets ?? 0) +
    (balanceSheet.tangibleAssets ?? 0) +
    (balanceSheet.financialAssets ?? 0);
  if (totalFixedAssets !== 0) {
    balanceSheet.totalFixedAssets = totalFixedAssets;
    balanceSheet.totalFixedAssetsGross = totalFixedAssets; // sans données amortissements détaillées
  }
  const totalCurrentAssets =
    (balanceSheet.rawMaterialInventories ?? 0) +
    (balanceSheet.inventoriesGoods ?? 0) +
    (balanceSheet.advancesAndPrepaymentsAssets ?? 0) +
    (balanceSheet.tradeReceivables ?? 0) +
    (balanceSheet.otherReceivables ?? 0) +
    (balanceSheet.marketableSecurities ?? 0) +
    (balanceSheet.cashAndCashEquivalents ?? 0) +
    (balanceSheet.prepaidExpenses ?? 0);
  if (totalCurrentAssets !== 0) {
    balanceSheet.totalCurrentAssets = totalCurrentAssets;
  }
  const totalAssets = totalFixedAssets + totalCurrentAssets;
  if (totalAssets !== 0) {
    balanceSheet.totalAssets = totalAssets;
  }

  const equity =
    (balanceSheet.shareCapital ?? 0) +
    (balanceSheet.revaluationDifferences ?? 0) +
    (balanceSheet.legalReserves ?? 0) +
    (balanceSheet.regulatoryReserves ?? 0) +
    (balanceSheet.otherReserves ?? 0) +
    (balanceSheet.retainedEarnings ?? 0) +
    (balanceSheet.investmentSubsidies ?? 0) +
    (balanceSheet.regulatoryProvisions ?? 0) +
    netResult; // résultat de l'exercice
  if (equity !== 0) {
    balanceSheet.equity = equity;
  }
  const debts =
    (balanceSheet.borrowings ?? 0) +
    (balanceSheet.debts ?? 0) +
    (balanceSheet.advancesAndPrepaymentsLiabilities ?? 0) +
    (balanceSheet.tradePayables ?? 0) +
    (balanceSheet.taxSocialPayables ?? 0) +
    (balanceSheet.associatesCurrentAccounts ?? 0) +
    (balanceSheet.otherDebts ?? 0) +
    (balanceSheet.deferredIncome ?? 0);
  if (debts !== 0) {
    balanceSheet.debts = debts;
  }
  const totalLiabilities = equity + (balanceSheet.provisions ?? 0) + debts;
  if (totalLiabilities !== 0) {
    balanceSheet.totalLiabilities = totalLiabilities;
  }

  return result;
}
