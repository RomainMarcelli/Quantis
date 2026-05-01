// Mappers Bridge → format interne Vyzor.
//
// Pas d'effet de bord, pas d'I/O. Tout ce dont on a besoin est passé en
// paramètre — testable en isolation avec des fixtures JSON brutes.

import { randomUUID } from "node:crypto";
import type {
  BankAccount,
  BankAccountType,
  BankOperationType,
  BankTransaction,
  BankingRunwayStatus,
  CategoryAggregate,
  MonthlyFlow,
  OperationTypeAggregate,
} from "@/types/banking";
import type {
  BridgeRawAccount,
  BridgeRawCategory,
  BridgeRawTransaction,
} from "@/services/integrations/adapters/bridge/fetchers";

// ─── Account ────────────────────────────────────────────────────────────

const ACCOUNT_TYPE_MAP: Record<string, BankAccountType> = {
  checking: "checking",
  current: "checking",
  savings: "savings",
  saving: "savings",
  livret: "savings",
  loan: "loan",
  credit: "loan",
  mortgage: "loan",
  card: "card",
  credit_card: "card",
};

function normalizeAccountType(raw: string | null | undefined): BankAccountType {
  if (!raw) return "other";
  const key = raw.toLowerCase().trim();
  return ACCOUNT_TYPE_MAP[key] ?? "other";
}

export function mapBridgeAccountToInternal(
  raw: BridgeRawAccount,
  options: { now?: Date; idGenerator?: () => string } = {}
): BankAccount {
  const now = options.now ?? new Date();
  const id = (options.idGenerator ?? randomUUID)();
  return {
    id,
    bridgeAccountId: raw.id,
    name: raw.name?.trim() || `Compte ${raw.id}`,
    type: normalizeAccountType(raw.type),
    balance: Number.isFinite(raw.balance) ? raw.balance : 0,
    currency: (raw.currency_code ?? "EUR").toUpperCase(),
    iban: raw.iban?.trim() || undefined,
    providerName: raw.provider?.name?.trim() || "Banque",
    lastRefreshedAt: raw.updated_at ?? now.toISOString(),
  };
}

// ─── Transaction ────────────────────────────────────────────────────────

const OPERATION_TYPE_MAP: Record<string, BankOperationType> = {
  card: "card",
  transfer: "transfer",
  sepa: "transfer",
  payment: "transfer",
  direct_debit: "direct_debit",
  prelevement: "direct_debit",
  check: "check",
  cheque: "check",
  withdrawal: "withdrawal",
  retrait: "withdrawal",
  deposit: "deposit",
  depot: "deposit",
};

function normalizeOperationType(raw: string | null | undefined): BankOperationType {
  if (!raw) return "unknown";
  const key = raw.toLowerCase().trim();
  return OPERATION_TYPE_MAP[key] ?? "unknown";
}

/**
 * Mappe une transaction Bridge brute. `accountIdResolver` permet de remapper
 * l'ID Bridge (numérique) vers notre ID interne — utile quand on a déjà
 * mappé les comptes en amont et qu'on veut conserver la cohérence.
 */
export function mapBridgeTransactionToInternal(
  raw: BridgeRawTransaction,
  options: {
    accountIdResolver?: (bridgeAccountId: number) => string;
    idGenerator?: () => string;
  } = {}
): BankTransaction {
  const id = (options.idGenerator ?? randomUUID)();
  const accountId = options.accountIdResolver
    ? options.accountIdResolver(raw.account_id)
    : String(raw.account_id);
  return {
    id,
    bridgeTransactionId: raw.id,
    accountId,
    amount: Number.isFinite(raw.amount) ? raw.amount : 0,
    date: raw.date,
    description: (raw.clean_description ?? raw.provider_description ?? "").trim(),
    rawDescription: raw.provider_description?.trim() || undefined,
    operationType: normalizeOperationType(raw.operation_type),
    categoryId: Number.isFinite(raw.category_id) ? raw.category_id : 0,
    isFuture: Boolean(raw.is_future),
  };
}

// ─── Agrégations ────────────────────────────────────────────────────────

/**
 * Agrège les transactions par mois (YYYY-MM). Convention Bridge :
 * amount > 0 = entrée, amount < 0 = sortie. Le `totalOut` est exprimé en
 * VALEUR ABSOLUE (positif) pour faciliter l'affichage côté UI.
 *
 * Trie par mois ascendant. Inclut tous les mois rencontrés dans les
 * transactions (pas de remplissage des trous — un mois vide n'apparaît pas).
 */
export function aggregateTransactionsByMonth(
  transactions: BankTransaction[]
): MonthlyFlow[] {
  const buckets = new Map<string, { totalIn: number; totalOut: number }>();
  for (const tx of transactions) {
    if (tx.isFuture) continue; // les futurs ne comptent pas dans les flux passés
    const month = tx.date.slice(0, 7); // YYYY-MM
    if (!buckets.has(month)) buckets.set(month, { totalIn: 0, totalOut: 0 });
    const bucket = buckets.get(month)!;
    if (tx.amount >= 0) bucket.totalIn += tx.amount;
    else bucket.totalOut += Math.abs(tx.amount);
  }
  return [...buckets.entries()]
    .map(([month, b]) => ({
      month,
      totalIn: round(b.totalIn),
      totalOut: round(b.totalOut),
      netFlow: round(b.totalIn - b.totalOut),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Burn rate = somme des sorties NETTES (sortie - entrée) sur la période /
 * nombre de jours. Si le solde est positif (l'entreprise génère du cash sur
 * la période), burn rate = 0 — on ne consomme pas de runway.
 *
 * `periodDays` est requis (et > 0) — l'appelant connaît la fenêtre choisie
 * (30 / 90 / 180 jours typiquement). Le mensuel est juste daily × 30.
 */
export function computeBurnRate(
  transactions: BankTransaction[],
  periodDays: number
): { dailyBurn: number; monthlyBurn: number } {
  if (!Number.isFinite(periodDays) || periodDays <= 0) {
    return { dailyBurn: 0, monthlyBurn: 0 };
  }
  let totalIn = 0;
  let totalOut = 0;
  for (const tx of transactions) {
    if (tx.isFuture) continue;
    if (tx.amount >= 0) totalIn += tx.amount;
    else totalOut += Math.abs(tx.amount);
  }
  const netOut = totalOut - totalIn;
  if (netOut <= 0) return { dailyBurn: 0, monthlyBurn: 0 };
  const dailyBurn = round(netOut / periodDays);
  return { dailyBurn, monthlyBurn: round(dailyBurn * 30) };
}

/**
 * Runway (mois de visibilité au rythme actuel de burn) + statut.
 * Si `monthlyBurn` ≤ 0 → l'entreprise ne consomme pas son cash → status=safe
 * et months = +Infinity (transformé en `Number.MAX_SAFE_INTEGER` pour garder
 * une valeur finie sérialisable côté Firestore).
 *
 * Seuils alignés avec le KPI cashRunwayMonths comptable :
 *   ≥ 12 mois → safe
 *   6 ≤ x < 12 → warning
 *   < 6 → critical
 */
export function computeRunway(
  totalBalance: number,
  monthlyBurn: number
): { months: number; status: BankingRunwayStatus } {
  if (!Number.isFinite(monthlyBurn) || monthlyBurn <= 0) {
    return { months: Number.MAX_SAFE_INTEGER, status: "safe" };
  }
  const months = round(totalBalance / monthlyBurn);
  let status: BankingRunwayStatus = "critical";
  if (months >= 12) status = "safe";
  else if (months >= 6) status = "warning";
  return { months, status };
}

/**
 * Top dépenses par catégorie. Filtre les transactions négatives (sorties),
 * agrège par categoryId, résout le label depuis le tableau de catégories
 * Bridge passé en paramètre (fallback : "Catégorie #<id>").
 *
 * Trié par total absolu desc. Pas de limite — l'appelant slice les 5
 * premiers s'il veut un top-5.
 */
export function groupByCategory(
  transactions: BankTransaction[],
  categories: Pick<BridgeRawCategory, "id" | "name">[] = []
): CategoryAggregate[] {
  const labelByCat = new Map<number, string>();
  for (const c of categories) labelByCat.set(c.id, c.name);

  const buckets = new Map<number, { total: number; count: number }>();
  for (const tx of transactions) {
    if (tx.isFuture) continue;
    if (tx.amount >= 0) continue; // on agrège les SORTIES uniquement
    const current = buckets.get(tx.categoryId) ?? { total: 0, count: 0 };
    current.total += Math.abs(tx.amount);
    current.count += 1;
    buckets.set(tx.categoryId, current);
  }
  return [...buckets.entries()]
    .map(([categoryId, b]) => ({
      categoryId,
      categoryLabel: labelByCat.get(categoryId) ?? `Catégorie #${categoryId}`,
      total: round(b.total),
      count: b.count,
    }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Agrégation par type d'opération (card, transfer, direct_debit, …). Inclut
 * entrées + sorties indistinctement (l'appelant peut filtrer si besoin).
 */
export function groupByOperationType(
  transactions: BankTransaction[]
): OperationTypeAggregate[] {
  const buckets = new Map<BankOperationType, { total: number; count: number }>();
  for (const tx of transactions) {
    if (tx.isFuture) continue;
    const current = buckets.get(tx.operationType) ?? { total: 0, count: 0 };
    current.total += Math.abs(tx.amount);
    current.count += 1;
    buckets.set(tx.operationType, current);
  }
  return [...buckets.entries()]
    .map(([type, b]) => ({ type, total: round(b.total), count: b.count }))
    .sort((a, b) => b.total - a.total);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
