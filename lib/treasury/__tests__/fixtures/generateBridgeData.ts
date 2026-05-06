// File: __tests__/treasury/fixtures/generateBridgeData.ts
// Role: générateur de fixtures déterministe pour le moteur trésorerie.
// PRNG seedé (LCG simple) pour des tests reproductibles. Pas d'I/O,
// retourne directement des arrays BankAccount[] / BankTransaction[].

import type { BankAccount, BankTransaction } from "@/types/banking";

// ─── PRNG seedé ─────────────────────────────────────────────────────────

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    // Mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Patterns récurrents par défaut ─────────────────────────────────────

export type RecurringPattern = {
  label: string;
  amount: number;
  /** Jour du mois (1-28). */
  dayOfMonth: number;
  frequency: "monthly" | "quarterly";
  categoryId: number;
  /** Variation aléatoire ± autour du montant en € (défaut 0). */
  amountJitter?: number;
};

const DEFAULT_PATTERNS: RecurringPattern[] = [
  { label: "LOYER", amount: -2800, dayOfMonth: 5, frequency: "monthly", categoryId: 110 },
  { label: "SALAIRE M.", amount: 8500, dayOfMonth: 25, frequency: "monthly", categoryId: 200, amountJitter: 5 },
  { label: "URSSAF", amount: -1850, dayOfMonth: 15, frequency: "monthly", categoryId: 120 },
  { label: "EDF ENERGIE", amount: -180, dayOfMonth: 10, frequency: "monthly", categoryId: 111, amountJitter: 30 },
  { label: "TVA TRIM", amount: -3500, dayOfMonth: 20, frequency: "quarterly", categoryId: 121, amountJitter: 50 },
];

// ─── Générateurs ────────────────────────────────────────────────────────

export type GenerateTransactionsParams = {
  /** Nombre TOTAL de transactions à générer (récurrentes + bruit). */
  count: number;
  /** Étalement sur N mois (par défaut 6). */
  months?: number;
  /** Date de fin (défaut 2026-05-01). Les transactions sont distribuées
   *  jusqu'à `months` mois en arrière. */
  endDate?: Date;
  /** Patterns récurrents — défaut DEFAULT_PATTERNS si non fourni. */
  patterns?: RecurringPattern[];
  /** Si true, supprime tous les patterns (transactions aléatoires uniquement). */
  noRecurring?: boolean;
  /** Nombre de transactions anormales injectées (montants × 10, etc.). */
  anomalies?: number;
  /** Nombre de virements internes (label "VIR INTERNE") injectés. */
  internalTransfers?: number;
  /** Pattern saisonnier sur les inflows — multiplie certains mois. */
  seasonality?: { monthIndexes: number[]; multiplier: number };
  /** Seed PRNG pour reproductibilité (défaut 42). */
  seed?: number;
  /** Account IDs à utiliser (défaut "acc-1"). */
  accountIds?: string[];
};

export function generateMockTransactions(
  params: GenerateTransactionsParams
): BankTransaction[] {
  const rng = makeRng(params.seed ?? 42);
  const months = params.months ?? 6;
  const endDate = params.endDate ?? new Date("2026-05-01T00:00:00Z");
  const startMs = endDate.getTime() - months * 30 * 86_400_000;
  const accountIds = params.accountIds ?? ["acc-1"];
  const patterns = params.noRecurring ? [] : params.patterns ?? DEFAULT_PATTERNS;
  const transactions: BankTransaction[] = [];
  let counter = 0;

  // 1. Génération des récurrences déterministes
  // Ancrage : on calcule la date de la PLUS RÉCENTE occurrence valide
  // (≤ endDate avec le bon dayOfMonth), puis on remonte dans le temps.
  for (const p of patterns) {
    const occurrences = p.frequency === "monthly" ? months : Math.ceil(months / 3);
    // Date d'ancrage = première occurrence ≤ endDate avec dayOfMonth de p
    const anchorDate = new Date(endDate);
    anchorDate.setUTCDate(p.dayOfMonth);
    if (anchorDate.getTime() > endDate.getTime()) {
      anchorDate.setUTCMonth(anchorDate.getUTCMonth() - 1);
    }
    for (let i = 0; i < occurrences; i++) {
      const txDate = new Date(anchorDate);
      const stepMonths = p.frequency === "monthly" ? i : i * 3;
      txDate.setUTCMonth(txDate.getUTCMonth() - stepMonths);
      if (txDate.getTime() < startMs || txDate.getTime() > endDate.getTime()) continue;
      const jitter = (p.amountJitter ?? 0) * (rng() * 2 - 1);
      // Saisonnalité — multiplie les inflows sur certains mois
      let amount = p.amount + jitter;
      if (
        p.amount > 0 &&
        params.seasonality &&
        params.seasonality.monthIndexes.includes(txDate.getUTCMonth())
      ) {
        amount *= params.seasonality.multiplier;
      }
      // Suffixe de date pour mimer les vrais labels Bridge ("LOYER 04/2026").
      // normalizeLabel doit retirer ce suffixe → groupage cohérent.
      const monthLabel = `${String(txDate.getUTCMonth() + 1).padStart(2, "0")}/${txDate.getUTCFullYear()}`;
      transactions.push(
        makeTx(counter++, accountIds[0]!, txDate, amount, `${p.label} ${monthLabel}`, p.categoryId)
      );
    }
  }

  // 2. Bruit aléatoire pour atteindre `count`
  const noiseLabels = [
    "Carrefour Express",
    "Uber Trip",
    "SNCF",
    "Amazon",
    "Restaurant",
    "Pharmacie",
    "Stripe",
    "Pennylane",
    "Boulangerie",
    "Apple",
  ];
  while (transactions.length < params.count) {
    const day = startMs + Math.floor(rng() * months * 30 * 86_400_000);
    const txDate = new Date(day);
    const isCredit = rng() < 0.3;
    const baseAmount = isCredit ? rng() * 2000 + 100 : -(rng() * 200 + 5);
    const label = noiseLabels[Math.floor(rng() * noiseLabels.length)]!;
    const cat = 300 + Math.floor(rng() * 20);
    transactions.push(
      makeTx(counter++, accountIds[Math.floor(rng() * accountIds.length)]!, txDate, baseAmount, label, cat)
    );
  }

  // 3. Anomalies (montants × 10 sur des labels existants)
  for (let i = 0; i < (params.anomalies ?? 0); i++) {
    if (transactions.length === 0) break;
    const sourceIdx = Math.floor(rng() * transactions.length);
    const source = transactions[sourceIdx]!;
    const txDate = new Date(source.date);
    txDate.setDate(txDate.getDate() + 1);
    transactions.push(
      makeTx(counter++, source.accountId, txDate, source.amount * 10, source.description, source.categoryId)
    );
  }

  // 4. Virements internes
  for (let i = 0; i < (params.internalTransfers ?? 0); i++) {
    const day = startMs + Math.floor(rng() * months * 30 * 86_400_000);
    const txDate = new Date(day);
    const amount = (rng() < 0.5 ? -1 : 1) * (1000 + rng() * 5000);
    transactions.push(
      makeTx(counter++, accountIds[0]!, txDate, amount, "VIR INTERNE COMPTE EPARGNE", 0)
    );
  }

  return transactions;
}

function makeTx(
  i: number,
  accountId: string,
  date: Date,
  amount: number,
  description: string,
  categoryId: number
): BankTransaction {
  return {
    id: `tx-${i}`,
    bridgeTransactionId: i + 1000,
    accountId,
    amount: Math.round(amount * 100) / 100,
    date: date.toISOString().slice(0, 10),
    description,
    operationType: amount >= 0 ? "transfer" : "card",
    categoryId,
    isFuture: false,
  };
}

export function generateMockAccounts(count: number, seed = 42): BankAccount[] {
  const rng = makeRng(seed);
  const types: BankAccount["type"][] = ["checking", "savings", "card", "loan"];
  const banks = ["BNP Paribas", "Crédit Agricole", "Société Générale", "LCL", "Boursorama"];
  const out: BankAccount[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      id: `acc-${i + 1}`,
      bridgeAccountId: 1000 + i,
      name: `Compte ${i + 1}`,
      type: types[i % types.length]!,
      balance: Math.round(rng() * 20000 - 2000),
      currency: "EUR",
      providerName: banks[i % banks.length]!,
      lastRefreshedAt: "2026-05-01T00:00:00Z",
    });
  }
  return out;
}
