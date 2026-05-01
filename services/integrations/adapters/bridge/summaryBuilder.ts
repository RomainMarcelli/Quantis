// Orchestrateur post-fetch : assemble un `BankingSummary` à partir des
// comptes + transactions Bridge déjà mappés. Pas d'I/O — tout est passé en
// paramètre. Volontairement séparé des mappers pour rester testable en
// isolation (le summary fait pas mal de combinaisons sur de gros tableaux).

import type {
  BankAccount,
  BankTransaction,
  BankingSummary,
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

  const recentTransactions = filterRecent(input.transactions, asOf, BURN_RATE_LOOKBACK_DAYS);
  const burn = computeBurnRate(recentTransactions, BURN_RATE_LOOKBACK_DAYS);
  const runway = computeRunway(totalBalance, burn.monthlyBurn);

  const monthlyFlowsAll = aggregateTransactionsByMonth(input.transactions);
  const monthlyFlows = monthlyFlowsAll.slice(-MONTHLY_FLOWS_LOOKBACK_MONTHS);

  const topExpenseCategories = groupByCategory(input.transactions, input.categories)
    .slice(0, MAX_TOP_CATEGORIES);

  const upcomingTransactions = input.transactions
    .filter((tx) => tx.isFuture)
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    accounts: input.accounts,
    totalBalance,
    burnRate: { daily: burn.dailyBurn, monthly: burn.monthlyBurn },
    runway,
    topExpenseCategories,
    monthlyFlows,
    upcomingTransactions,
    lastSyncAt: asOf.toISOString(),
  };
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

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
