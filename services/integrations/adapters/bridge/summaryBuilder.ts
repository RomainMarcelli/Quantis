// Orchestrateur post-fetch : assemble un `BankingSummary` à partir des
// comptes + transactions Bridge déjà mappés. Pas d'I/O — tout est passé en
// paramètre. Volontairement séparé des mappers pour rester testable en
// isolation (le summary fait pas mal de combinaisons sur de gros tableaux).

import type {
  BalanceHistoryPoint,
  BankAccount,
  BankTransaction,
  BankingSummary,
  MonthlyFlow,
} from "@/types/banking";
import {
  aggregateTransactionsByMonth,
  computeBurnRate,
  computeRunway,
  groupByCategory,
} from "@/services/integrations/adapters/bridge/mappers";
import type { BridgeRawCategory } from "@/services/integrations/adapters/bridge/fetchers";

const MAX_TOP_CATEGORIES = 5;
const MONTHLY_FLOWS_LOOKBACK_MONTHS = 12;
const BURN_RATE_LOOKBACK_DAYS = 90;
const RECENT_TRANSACTIONS_LOOKBACK_DAYS = 90;
const BALANCE_HISTORY_LOOKBACK_MONTHS = 6;

export type BuildBankingSummaryInput = {
  accounts: BankAccount[];
  transactions: BankTransaction[];
  categories?: Pick<BridgeRawCategory, "id" | "name">[];
  /** Date "now" pour le calcul du burn rate (testable). Défaut: now(). */
  asOf?: Date;
};

/**
 * Construit le `BankingSummary` final à stocker en Firestore.
 *
 * Choix algorithmiques :
 *   - `totalBalance` somme tous les comptes y compris loans/cards (qui sont
 *     négatifs côté Bridge). Le résultat reflète la position cash NETTE.
 *   - `burnRate` calculé sur les 90 derniers jours (suffisamment large pour
 *     lisser les variations mensuelles, suffisamment court pour rester
 *     représentatif de la tendance actuelle).
 *   - `monthlyFlows` retient les 12 derniers mois max (graph 1 an).
 *   - `topExpenseCategories` slice à 5.
 *   - `upcomingTransactions` triées par date asc — les plus proches en haut.
 */
export function buildBankingSummary(input: BuildBankingSummaryInput): BankingSummary {
  const asOf = input.asOf ?? new Date();
  const totalBalance = round(
    input.accounts.reduce((sum, account) => sum + account.balance, 0)
  );

  const burnWindow = filterRecent(input.transactions, asOf, BURN_RATE_LOOKBACK_DAYS);
  const burn = computeBurnRate(burnWindow, BURN_RATE_LOOKBACK_DAYS);
  const runway = computeRunway(totalBalance, burn.monthlyBurn);

  const monthlyFlowsAll = aggregateTransactionsByMonth(input.transactions);
  const monthlyFlows = monthlyFlowsAll.slice(-MONTHLY_FLOWS_LOOKBACK_MONTHS);

  const topExpenseCategories = groupByCategory(input.transactions, input.categories)
    .slice(0, MAX_TOP_CATEGORIES);

  const upcomingTransactions = input.transactions
    .filter((tx) => tx.isFuture)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Transactions des 90 derniers jours (passées + futures), triées
  // chronologiquement desc — la vue Trésorerie les pagine en local.
  const recentTransactions = filterRecentIncludingFuture(
    input.transactions,
    asOf,
    RECENT_TRANSACTIONS_LOOKBACK_DAYS
  ).sort((a, b) => b.date.localeCompare(a.date));

  const balanceHistory = buildBalanceHistory(
    totalBalance,
    monthlyFlows,
    asOf,
    BALANCE_HISTORY_LOOKBACK_MONTHS
  );

  return {
    accounts: input.accounts,
    totalBalance,
    burnRate: { daily: burn.dailyBurn, monthly: burn.monthlyBurn },
    runway,
    topExpenseCategories,
    monthlyFlows,
    balanceHistory,
    recentTransactions,
    upcomingTransactions,
    lastSyncAt: asOf.toISOString(),
  };
}

/**
 * Reconstruit l'historique du solde "à reculons" depuis le solde courant en
 * appliquant les flux nets mensuels. Approximation utile pour visualiser une
 * tendance — pas une donnée comptable précise (ne tient pas compte des
 * comptes ouverts/fermés en cours de période).
 *
 * Convention :
 *   balanceHistory[i].totalBalance = solde au DÉBUT du mois i (≈ fin du
 *   mois i-1). Le dernier point représente le mois courant avec le solde
 *   actuel.
 *
 * Algorithme : pour chaque mois M en partant du plus récent, le solde au
 * début de M = solde au début du mois suivant − netFlow(M).
 */
function buildBalanceHistory(
  currentBalance: number,
  monthlyFlows: MonthlyFlow[],
  asOf: Date,
  lookbackMonths: number
): BalanceHistoryPoint[] {
  if (monthlyFlows.length === 0) return [];
  const flows = monthlyFlows.slice(-lookbackMonths);
  const currentMonth = asOf.toISOString().slice(0, 7);

  const points: BalanceHistoryPoint[] = [];
  let runningBalance = currentBalance;

  // 1. Ajouter le mois courant si pas déjà dans les flux (cas typique :
  //    asOf est en cours de mois et aucun flux n'a encore été agrégé pour ce
  //    mois). Le point courant porte le solde actuel.
  if (!flows.some((f) => f.month === currentMonth)) {
    points.push({ month: currentMonth, totalBalance: round(runningBalance) });
  }

  // 2. Remonter les flux : on soustrait le netFlow AVANT de pousser, pour
  //    que chaque point reflète le solde au DÉBUT du mois (= avant le flux
  //    de ce mois).
  for (let i = flows.length - 1; i >= 0; i--) {
    const flow = flows[i]!;
    runningBalance -= flow.netFlow;
    points.unshift({ month: flow.month, totalBalance: round(runningBalance) });
  }

  return points;
}

function filterRecent(
  transactions: BankTransaction[],
  asOf: Date,
  days: number
): BankTransaction[] {
  const minDate = new Date(asOf.getTime() - days * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return transactions.filter((tx) => !tx.isFuture && tx.date >= minDate);
}

/** Variante incluant les transactions futures — pour la vue Transactions
 *  de l'onglet Trésorerie qui doit montrer les prélèvements à venir. */
function filterRecentIncludingFuture(
  transactions: BankTransaction[],
  asOf: Date,
  days: number
): BankTransaction[] {
  const minDate = new Date(asOf.getTime() - days * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return transactions.filter((tx) => tx.date >= minDate);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
