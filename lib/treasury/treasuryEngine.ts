// File: lib/treasury/treasuryEngine.ts
// Role: moteur d'analyse trésorerie. Pur TypeScript, zéro dépendance externe,
// pas de side effect — testable unitairement avec fixtures déterministes.
//
// 7 fonctions exposées :
//   - detectRecurringTransactions  : récurrences mensuelles/trimestrielles
//   - projectBalance                : solde glissant J+N
//   - computeCashFlowMetrics        : entrées/sorties + burn + runway + ratios
//   - analyzeExpenses               : top catégories + anomalies + charges fixes
//   - findCriticalDays              : jours du mois où le solde est au plus bas
//   - stressTest                    : projection avec scénario de stress
//   - analyzeTreasury               : orchestre tout + alertes + healthScore
//
// Conventions :
//   - Les transactions ont `amount` POSITIF = entrée, NÉGATIF = sortie
//     (alignement avec la convention Bridge utilisée dans `types/banking.ts`)
//   - Les transactions futures (`isFuture = true`) sont exclues des
//     statistiques historiques mais pertinentes pour la projection
//   - Les virements internes peuvent être exclus via `internalTransferPatterns`

import type { BankAccount, BankTransaction } from "@/types/banking";
import type {
  CashFlowMetrics,
  CriticalDay,
  DailyProjection,
  ExpenseAnalysis,
  ExpenseAnomaly,
  ExpenseCategory,
  ProjectionEvent,
  RecurringTransaction,
  StressTestParams,
  TreasuryAlert,
  TreasuryAnalysis,
  TreasuryOptions,
} from "@/types/treasury";

// ─── Constantes ─────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const MONTH_DAYS = 30;
const QUARTER_DAYS = 90;
/** Tolérance ±5 j sur l'intervalle pour qualifier une mensualité. */
const MONTHLY_TOLERANCE_DAYS = 5;
const QUARTERLY_TOLERANCE_DAYS = 10;
/** Écart-type max sur le montant (en % de la moyenne) pour rester "régulier". */
const AMOUNT_STDDEV_THRESHOLD = 0.1;
/** Minimum d'occurrences pour qualifier une récurrence. */
const MIN_RECURRENCE_OCCURRENCES = 3;
/** Multiplicateur au-delà duquel une transaction devient anormale. */
const ANOMALY_MULTIPLIER = 2;
/** Seuil par défaut pour `isAlert` sur les projections (€). */
const DEFAULT_ALERT_THRESHOLD = 1000;

// ─── Helpers ────────────────────────────────────────────────────────────

/** Validation d'une transaction — protège l'engine contre les données
 *  corrompues. Retourne `null` si on doit ignorer. */
function isValidTransaction(tx: BankTransaction): boolean {
  if (!tx) return false;
  if (typeof tx.amount !== "number" || !Number.isFinite(tx.amount)) return false;
  if (tx.amount === 0) return false; // 0 € = bruit, on ignore
  if (typeof tx.date !== "string" || !tx.date) return false;
  const t = Date.parse(tx.date);
  if (!Number.isFinite(t)) return false;
  return true;
}

/** Normalise un label transaction pour le groupage récurrence :
 *  - lowercase + trim
 *  - retire dates (jj/mm, jj/mm/aaaa, mm/aaaa)
 *  - retire numéros de référence longs (séquences ≥ 6 chiffres)
 *  - retire suffixes mensuels FR ("avril", "mai 2026"...) */
const MONTHS_FR =
  /\b(janvier|janv\.?|f[ée]vrier|f[ée]vr?\.?|mars|avril|avr\.?|mai|juin|juillet|juill?\.?|ao[uû]t|septembre|sept\.?|octobre|oct\.?|novembre|nov\.?|d[ée]cembre|d[ée]c\.?|january|february|march|april|may|june|july|august|september|october|november|december)\b/gi;

export function normalizeLabel(label: string | null | undefined): string {
  if (!label || typeof label !== "string") return "non catégorisé";
  let s = label.toLowerCase().trim();
  // Dates : jj/mm/aaaa, jj-mm-aaaa, jj.mm.aaaa OU mm/aaaa OU jj/mm
  // Élargi aux 1-4 chiffres pour capturer "04/2026" (mois/année)
  s = s.replace(/\b\d{1,4}[/.\-]\d{1,4}([/.\-]\d{2,4})?\b/g, " ");
  // Mois français/anglais (MAI, AVRIL, etc.)
  s = s.replace(MONTHS_FR, " ");
  // Années isolées 19xx/20xx
  s = s.replace(/\b(19|20)\d{2}\b/g, " ");
  // Numéros longs (références ≥ 4 chiffres ; 4 et plus pour intercepter
  // "REF 1234" et plus court qu'avant pour ne pas laisser des numéros
  // de référence partielle dans le label).
  s = s.replace(/\b\d{4,}\b/g, " ");
  // "REF" ou "ref" résiduel suivi d'espaces/numéros — on le retire pour
  // éviter qu'il devienne une fausse signature.
  s = s.replace(/\b(ref|n[°o]?)\s*\d*\b/gi, " ");
  // Espaces multiples
  s = s.replace(/\s+/g, " ").trim();
  return s || "non catégorisé";
}

function timeOf(dateStr: string): number {
  return Date.parse(dateStr);
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const sq = values.reduce((acc, v) => acc + (v - m) ** 2, 0);
  return Math.sqrt(sq / values.length);
}

function monthKey(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (!Number.isFinite(d.getTime())) return "0000-00";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Trie + déduplique les transactions (clé : `id`). */
function sanitizeTransactions(txs: BankTransaction[]): BankTransaction[] {
  if (!Array.isArray(txs)) return [];
  const seen = new Set<string>();
  const out: BankTransaction[] = [];
  for (const tx of txs) {
    if (!isValidTransaction(tx)) continue;
    if (tx.id && seen.has(tx.id)) continue;
    if (tx.id) seen.add(tx.id);
    out.push(tx);
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

function isInternalTransfer(
  tx: BankTransaction,
  patterns: string[] | undefined
): boolean {
  if (!patterns || patterns.length === 0) return false;
  const label = (tx.description || "").toLowerCase();
  return patterns.some((p) => label.includes(p.toLowerCase()));
}

// ─── 1.1  detectRecurringTransactions ───────────────────────────────────

/**
 * Détecte les transactions récurrentes (mensuelles ou trimestrielles).
 *
 * Algorithme :
 *  1. Filtre les transactions valides + tri ASC
 *  2. Groupe par label normalisé
 *  3. Pour chaque groupe ≥ 3 occurrences, calcule l'intervalle moyen et
 *     son écart-type
 *  4. Qualifie comme mensuel si intervalle ∈ [25, 35] jours, trimestriel
 *     si ∈ [80, 100] jours
 *  5. Vérifie la stabilité du montant (écart-type < 10 % de la moyenne)
 *  6. Calcule reliability = 0.6 × stabilité_intervalle + 0.4 × stabilité_montant
 */
export function detectRecurringTransactions(
  transactions: BankTransaction[]
): RecurringTransaction[] {
  const valid = sanitizeTransactions(transactions).filter((tx) => !tx.isFuture);
  // Groupage
  const groups = new Map<string, BankTransaction[]>();
  for (const tx of valid) {
    const key = normalizeLabel(tx.description);
    const arr = groups.get(key) ?? [];
    arr.push(tx);
    groups.set(key, arr);
  }

  const result: RecurringTransaction[] = [];
  for (const [normalized, txs] of groups.entries()) {
    if (txs.length < MIN_RECURRENCE_OCCURRENCES) continue;

    // Intervalles successifs en jours
    const intervals: number[] = [];
    for (let i = 1; i < txs.length; i++) {
      const dt = (timeOf(txs[i]!.date) - timeOf(txs[i - 1]!.date)) / DAY_MS;
      if (Number.isFinite(dt) && dt > 0) intervals.push(dt);
    }
    if (intervals.length === 0) continue;

    const avgInterval = mean(intervals);
    const intervalStd = stdDev(intervals);

    let frequency: "monthly" | "quarterly" | null = null;
    if (Math.abs(avgInterval - MONTH_DAYS) <= MONTHLY_TOLERANCE_DAYS) {
      frequency = "monthly";
    } else if (Math.abs(avgInterval - QUARTER_DAYS) <= QUARTERLY_TOLERANCE_DAYS) {
      frequency = "quarterly";
    }
    if (!frequency) continue;

    // Stabilité montant : on vérifie que le signe est cohérent pour qualifier
    // type=expense ou income, et que l'écart-type relatif reste sous le seuil.
    const amounts = txs.map((t) => t.amount);
    const amountMean = mean(amounts);
    if (Math.abs(amountMean) < 0.01) continue;
    const amountStd = stdDev(amounts);
    const relStdAmount = amountStd / Math.abs(amountMean);
    if (relStdAmount > AMOUNT_STDDEV_THRESHOLD) continue;

    // Cohérence de signe — on rejette si > 30 % des occurrences ont un signe opposé.
    const sameSign = amounts.filter((a) => Math.sign(a) === Math.sign(amountMean)).length;
    if (sameSign / amounts.length < 0.7) continue;

    const lastTx = txs[txs.length - 1]!;
    const lastDate = new Date(lastTx.date);
    const expectedDays = frequency === "monthly" ? MONTH_DAYS : QUARTER_DAYS;
    const nextExpectedDate = new Date(lastDate.getTime() + expectedDays * DAY_MS);

    // Reliability — intervalle relativement stable + montant stable.
    const targetInterval = expectedDays;
    const intervalScore = Math.max(0, 1 - intervalStd / targetInterval);
    const amountScore = Math.max(0, 1 - relStdAmount / AMOUNT_STDDEV_THRESHOLD);
    const reliability = Math.round((0.6 * intervalScore + 0.4 * amountScore) * 100) / 100;

    // Catégorie majoritaire
    const catBuckets = new Map<number, number>();
    for (const tx of txs) {
      const c = tx.categoryId ?? 0;
      catBuckets.set(c, (catBuckets.get(c) ?? 0) + 1);
    }
    const majorityCat = [...catBuckets.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;

    result.push({
      label: lastTx.description || normalized,
      labelNormalized: normalized,
      averageAmount: round2(amountMean),
      frequency,
      type: amountMean >= 0 ? "income" : "expense",
      occurrences: txs.length,
      reliability,
      nextExpectedDate,
      lastDate,
      categoryId: majorityCat,
    });
  }
  return result.sort((a, b) => Math.abs(b.averageAmount) - Math.abs(a.averageAmount));
}

// ─── 1.2  projectBalance ─────────────────────────────────────────────────

/**
 * Projette le solde jour par jour sur `horizonDays` à partir du solde courant
 * + des récurrences détectées. Tolérance ±2 jours sur la date d'application
 * (les prélèvements bancaires glissent souvent du week-end au lundi).
 */
export function projectBalance(
  accounts: BankAccount[],
  _transactions: BankTransaction[],
  recurring: RecurringTransaction[],
  horizonDays: number,
  options: { asOf?: Date; alertThreshold?: number } = {}
): DailyProjection[] {
  const asOf = options.asOf ?? new Date();
  const alertThreshold = options.alertThreshold ?? DEFAULT_ALERT_THRESHOLD;
  const startBalance = sumAccountBalances(accounts);
  const projections: DailyProjection[] = [];

  let runningBalance = startBalance;
  for (let d = 1; d <= Math.max(0, Math.floor(horizonDays)); d++) {
    const date = new Date(asOf.getTime() + d * DAY_MS);
    const events: ProjectionEvent[] = [];
    for (const r of recurring) {
      if (matchesRecurrenceDay(date, r)) {
        events.push({ label: r.label, amount: r.averageAmount });
        runningBalance += r.averageAmount;
      }
    }
    projections.push({
      date,
      projectedBalance: round2(runningBalance),
      events,
      isAlert: runningBalance < alertThreshold,
    });
  }
  return projections;
}

/** Vrai si `date` correspond à un cycle attendu de `recurring` (±2 jours). */
function matchesRecurrenceDay(date: Date, r: RecurringTransaction): boolean {
  const periodDays = r.frequency === "monthly" ? MONTH_DAYS : QUARTER_DAYS;
  const elapsed = (date.getTime() - r.nextExpectedDate.getTime()) / DAY_MS;
  // Ramène l'écart à l'intérieur d'une période [-period/2, +period/2]
  const wrapped = ((elapsed % periodDays) + periodDays) % periodDays;
  const distance = Math.min(wrapped, periodDays - wrapped);
  // Match si l'écart à un cycle est ≤ 2 jours, et la date est ≥ nextExpectedDate
  return distance <= 2 && date.getTime() >= r.nextExpectedDate.getTime() - 2 * DAY_MS;
}

function sumAccountBalances(accounts: BankAccount[]): number {
  if (!Array.isArray(accounts)) return 0;
  let sum = 0;
  for (const a of accounts) {
    if (typeof a?.balance === "number" && Number.isFinite(a.balance)) {
      sum += a.balance;
    }
  }
  return round2(sum);
}

// ─── 1.3  computeCashFlowMetrics ─────────────────────────────────────────

/**
 * Agrège les flux mensuels + dérive burn / runway / ratios. Les virements
 * internes sont exclus si `internalTransferPatterns` est fourni.
 */
export function computeCashFlowMetrics(
  transactions: BankTransaction[],
  options: {
    totalBalance?: number;
    internalTransferPatterns?: string[];
  } = {}
): CashFlowMetrics {
  const valid = sanitizeTransactions(transactions).filter(
    (tx) => !tx.isFuture && !isInternalTransfer(tx, options.internalTransferPatterns)
  );

  const monthlyInflows = new Map<string, number>();
  const monthlyOutflows = new Map<string, number>();
  for (const tx of valid) {
    const m = monthKey(tx.date);
    if (tx.amount >= 0) {
      monthlyInflows.set(m, (monthlyInflows.get(m) ?? 0) + tx.amount);
    } else {
      monthlyOutflows.set(m, (monthlyOutflows.get(m) ?? 0) + Math.abs(tx.amount));
    }
  }

  const netCashFlowByMonth = new Map<string, number>();
  const allMonths = new Set([...monthlyInflows.keys(), ...monthlyOutflows.keys()]);
  for (const m of allMonths) {
    netCashFlowByMonth.set(
      m,
      round2((monthlyInflows.get(m) ?? 0) - (monthlyOutflows.get(m) ?? 0))
    );
  }

  // Mois "complets" : on retire le premier et le dernier si on a > 1 mois
  // (ils peuvent être partiels selon la fenêtre de sync).
  const sortedMonths = [...allMonths].sort();
  const completeMonths = sortedMonths.length >= 3 ? sortedMonths.slice(1, -1) : sortedMonths;

  const completeInflows = completeMonths.map((m) => monthlyInflows.get(m) ?? 0);
  const completeOutflows = completeMonths.map((m) => monthlyOutflows.get(m) ?? 0);

  const averageMonthlyIncome = round2(mean(completeInflows));
  const averageMonthlyBurn = round2(mean(completeOutflows));
  const burnRateNet = round2(averageMonthlyBurn - averageMonthlyIncome);

  const totalBalance = options.totalBalance ?? 0;
  const runwayMonths =
    burnRateNet > 0 ? round2(totalBalance / burnRateNet) : null;

  const cashFlowRatio =
    averageMonthlyBurn > 0
      ? round2(averageMonthlyIncome / averageMonthlyBurn)
      : averageMonthlyIncome > 0
        ? Number.POSITIVE_INFINITY
        : 0;

  // Régularité — 1 - (écart-type / moyenne) clampé [0, 1].
  let incomeRegularityIndex = 1;
  if (completeInflows.length >= 2 && averageMonthlyIncome > 0) {
    const std = stdDev(completeInflows);
    const cv = std / averageMonthlyIncome;
    incomeRegularityIndex = round2(Math.max(0, Math.min(1, 1 - cv)));
  } else if (completeInflows.length === 0) {
    incomeRegularityIndex = 0;
  }

  return {
    monthlyInflows,
    monthlyOutflows,
    netCashFlowByMonth,
    averageMonthlyBurn,
    averageMonthlyIncome,
    burnRateNet,
    runwayMonths,
    cashFlowRatio,
    incomeRegularityIndex,
  };
}

// ─── 1.4  analyzeExpenses ───────────────────────────────────────────────

export function analyzeExpenses(
  transactions: BankTransaction[],
  recurring: RecurringTransaction[] = [],
  options: { internalTransferPatterns?: string[] } = {}
): ExpenseAnalysis {
  const valid = sanitizeTransactions(transactions).filter(
    (tx) => !tx.isFuture && !isInternalTransfer(tx, options.internalTransferPatterns)
  );
  const expenses = valid.filter((tx) => tx.amount < 0);
  const totalAbs = expenses.reduce((s, t) => s + Math.abs(t.amount), 0);

  // Agrégation par catégorie (categoryId ↔ label normalisé fallback).
  const buckets = new Map<string, { total: number; count: number; lastMonth: number; prevMonth: number }>();
  const sortedMonths = [...new Set(expenses.map((tx) => monthKey(tx.date)))].sort();
  const lastMonth = sortedMonths[sortedMonths.length - 1];
  const prevMonth = sortedMonths[sortedMonths.length - 2];
  for (const tx of expenses) {
    const key = normalizeLabel(tx.description);
    const cur = buckets.get(key) ?? { total: 0, count: 0, lastMonth: 0, prevMonth: 0 };
    cur.total += Math.abs(tx.amount);
    cur.count += 1;
    const m = monthKey(tx.date);
    if (m === lastMonth) cur.lastMonth += Math.abs(tx.amount);
    if (m === prevMonth) cur.prevMonth += Math.abs(tx.amount);
    buckets.set(key, cur);
  }

  const topCategories: ExpenseCategory[] = [...buckets.entries()]
    .map(([label, b]) => {
      const pct = totalAbs > 0 ? round2((b.total / totalAbs) * 100) : 0;
      const trend =
        b.prevMonth > 0
          ? round2(((b.lastMonth - b.prevMonth) / b.prevMonth) * 100)
          : b.lastMonth > 0
            ? Number.POSITIVE_INFINITY
            : 0;
      return { label, total: round2(b.total), pct, trend };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  // Charges fixes = somme des récurrences de type expense (mensuel + trim/3)
  const fixedCharges = recurring
    .filter((r) => r.type === "expense")
    .reduce((s, r) => {
      const monthlyEquivalent =
        r.frequency === "monthly" ? Math.abs(r.averageAmount) : Math.abs(r.averageAmount) / 3;
      return s + monthlyEquivalent;
    }, 0);

  // Total mensuel (moyenne sur mois complets)
  const monthlyTotal =
    sortedMonths.length > 0 ? totalAbs / sortedMonths.length : 0;
  const variableCharges = Math.max(0, monthlyTotal - fixedCharges);
  const fixedChargesRatio = monthlyTotal > 0 ? round2(fixedCharges / monthlyTotal) : 0;

  // Anomalies : > 2× la moyenne du label, OU label jamais vu auparavant.
  const meansByLabel = new Map<string, number>();
  for (const [label, b] of buckets.entries()) {
    if (b.count > 0) meansByLabel.set(label, b.total / b.count);
  }
  const anomalies: ExpenseAnomaly[] = [];
  for (const tx of expenses) {
    const label = normalizeLabel(tx.description);
    const avg = meansByLabel.get(label);
    if (avg && Math.abs(tx.amount) > avg * ANOMALY_MULTIPLIER) {
      anomalies.push({
        transaction: tx,
        reason: `Montant ${(Math.abs(tx.amount) / avg).toFixed(1)}× la moyenne de "${label}"`,
      });
    }
  }
  // Cap à 50 pour ne pas exploser la sortie.
  return {
    topCategories,
    fixedCharges: round2(fixedCharges),
    variableCharges: round2(variableCharges),
    fixedChargesRatio,
    anomalies: anomalies.slice(0, 50),
  };
}

// ─── 1.5  findCriticalDays ──────────────────────────────────────────────

/**
 * Reconstitue le solde jour par jour à partir des transactions historiques
 * (en partant de zéro — on s'intéresse au PROFIL relatif intra-mois, pas au
 * solde absolu) et identifie les jours du mois où le creux se produit.
 */
export function findCriticalDays(transactions: BankTransaction[]): CriticalDay[] {
  const valid = sanitizeTransactions(transactions).filter((tx) => !tx.isFuture);
  if (valid.length === 0) return [];

  // Reconstruction du solde relatif jour par jour
  const dailyDelta = new Map<string, number>();
  for (const tx of valid) {
    const d = tx.date.slice(0, 10);
    dailyDelta.set(d, (dailyDelta.get(d) ?? 0) + tx.amount);
  }
  const days = [...dailyDelta.keys()].sort();
  if (days.length === 0) return [];
  const balanceByDay = new Map<string, number>();
  let running = 0;
  for (const d of days) {
    running += dailyDelta.get(d) ?? 0;
    balanceByDay.set(d, running);
  }

  // Pour chaque jour du mois (1-31), moyenne du solde sur les mois observés
  const balancesByDayOfMonth = new Map<number, number[]>();
  for (const [d, balance] of balanceByDay.entries()) {
    const dayOfMonth = parseInt(d.slice(8, 10), 10);
    if (!Number.isFinite(dayOfMonth)) continue;
    const arr = balancesByDayOfMonth.get(dayOfMonth) ?? [];
    arr.push(balance);
    balancesByDayOfMonth.set(dayOfMonth, arr);
  }

  // Top 3 jours avec le solde moyen le plus bas
  const aggregated = [...balancesByDayOfMonth.entries()]
    .map(([dayOfMonth, balances]) => ({ dayOfMonth, average: mean(balances) }))
    .sort((a, b) => a.average - b.average);
  const lowest = aggregated.slice(0, 3);

  // Pour chaque jour critique, on liste les labels des plus grosses sorties
  // tombées exactement sur ce jour du mois.
  return lowest.map(({ dayOfMonth, average }) => {
    const causes = valid
      .filter((tx) => parseInt(tx.date.slice(8, 10), 10) === dayOfMonth && tx.amount < 0)
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
      .slice(0, 3)
      .map((tx) => tx.description || "Sans libellé");
    return {
      dayOfMonth,
      averageBalance: round2(average),
      causeLabels: causes,
    };
  });
}

// ─── 1.6  stressTest ─────────────────────────────────────────────────────

/**
 * Stress test : applique un scénario aux récurrences (réduction des
 * encaissements + suppression d'un client + charge ponctuelle) et projette
 * le solde sur la durée demandée. Délègue à `projectBalance` après
 * modification des récurrences.
 */
export function stressTest(
  params: StressTestParams & { asOf?: Date }
): DailyProjection[] {
  const { accounts, transactions, recurring, scenario, alertThreshold, asOf } = params;
  const reduction = clamp(scenario.incomeReduction ?? 0, 0, 1);
  const additionalExpense = scenario.additionalExpense ?? 0;
  const lostClientAmount = Math.abs(scenario.lostClientAmount ?? 0);
  const months = Math.max(1, scenario.durationMonths);
  const horizonDays = months * MONTH_DAYS;

  // Modifie les récurrences : on baisse les revenus de `reduction`, et on
  // soustrait le client perdu sur la première récurrence revenu majeure
  // (heuristique : la plus grosse `income` mensuelle).
  let stressed: RecurringTransaction[] = recurring.map((r) => {
    if (r.type === "income") {
      return { ...r, averageAmount: r.averageAmount * (1 - reduction) };
    }
    return r;
  });

  if (lostClientAmount > 0) {
    const sortedIncomes = [...stressed]
      .map((r, i) => ({ r, i }))
      .filter((x) => x.r.type === "income" && x.r.frequency === "monthly")
      .sort((a, b) => b.r.averageAmount - a.r.averageAmount);
    const target = sortedIncomes[0];
    if (target) {
      stressed = stressed.map((r, i) => {
        if (i !== target.i) return r;
        return {
          ...r,
          averageAmount: Math.max(0, r.averageAmount - lostClientAmount),
        };
      });
    }
  }

  const projections = projectBalance(accounts, transactions, stressed, horizonDays, {
    asOf: asOf ?? new Date(),
    alertThreshold,
  });

  // Charge ponctuelle ajoutée le jour 1 de la projection
  if (additionalExpense !== 0 && projections.length > 0) {
    projections[0]!.events.push({
      label: "Charge exceptionnelle",
      amount: -Math.abs(additionalExpense),
    });
    for (let i = 0; i < projections.length; i++) {
      projections[i]!.projectedBalance = round2(
        projections[i]!.projectedBalance - Math.abs(additionalExpense)
      );
    }
  }

  return projections;
}

// ─── 1.7  analyzeTreasury (orchestre tout) ──────────────────────────────

export function analyzeTreasury(
  bankingSummary: { accounts: BankAccount[]; transactions?: BankTransaction[]; recentTransactions?: BankTransaction[]; totalBalance?: number },
  options: TreasuryOptions = {}
): TreasuryAnalysis {
  const accounts = bankingSummary.accounts ?? [];
  // Le BankingSummary stocke ses transactions sous `recentTransactions`. On
  // accepte aussi un `transactions` brut pour faciliter les tests.
  const transactions =
    bankingSummary.transactions ??
    bankingSummary.recentTransactions ??
    [];
  const totalBalance = bankingSummary.totalBalance ?? sumAccountBalances(accounts);
  const internalTransferPatterns = options.internalTransferPatterns;
  const alertThreshold = options.alertThreshold ?? DEFAULT_ALERT_THRESHOLD;

  const recurring = detectRecurringTransactions(transactions);
  const cashFlow = computeCashFlowMetrics(transactions, {
    totalBalance,
    internalTransferPatterns,
  });
  const expenses = analyzeExpenses(transactions, recurring, { internalTransferPatterns });
  const criticalDays = findCriticalDays(transactions);

  const projection30 = projectBalance(accounts, transactions, recurring, 30, {
    asOf: options.asOf,
    alertThreshold,
  });
  const projection60 = projectBalance(accounts, transactions, recurring, 60, {
    asOf: options.asOf,
    alertThreshold,
  });
  const projection90 = projectBalance(accounts, transactions, recurring, 90, {
    asOf: options.asOf,
    alertThreshold,
  });

  const healthScore = computeHealthScore({
    runwayMonths: cashFlow.runwayMonths,
    cashFlowRatio: cashFlow.cashFlowRatio,
    incomeRegularityIndex: cashFlow.incomeRegularityIndex,
    fixedChargesRatio: expenses.fixedChargesRatio,
    anomalyCount: expenses.anomalies.length,
  });

  const alerts = buildAlerts({
    projection30,
    projection60,
    cashFlow,
    expenses,
    totalBalance,
    alertThreshold,
  });

  return {
    totalBalance,
    recurring,
    projection30,
    projection60,
    projection90,
    cashFlow,
    expenses,
    criticalDays,
    healthScore,
    alerts,
  };
}

// ─── Health score & alertes ─────────────────────────────────────────────

function computeHealthScore(input: {
  runwayMonths: number | null;
  cashFlowRatio: number;
  incomeRegularityIndex: number;
  fixedChargesRatio: number;
  anomalyCount: number;
}): number {
  // Runway : 0 si null ou 0, plein à 18+ mois.
  const runwayScore =
    input.runwayMonths === null
      ? 100
      : Math.min(100, Math.max(0, (input.runwayMonths / 18) * 100));
  // Cash flow ratio : 0 si 0, 100 si ≥ 1.5
  const cfrScore = Math.min(
    100,
    Math.max(0, (Math.min(input.cashFlowRatio, 1.5) / 1.5) * 100)
  );
  // Régularité : 0-1 → 0-100
  const regScore = input.incomeRegularityIndex * 100;
  // Charges fixes : optimum à 50 % (ni 0 ni 100). 100 - |0.5 - ratio| × 200
  const fcScore = Math.max(0, 100 - Math.abs(0.5 - input.fixedChargesRatio) * 200);
  // Anomalies : 0 anomalies = 100, ≥ 10 = 0
  const anomScore = Math.max(0, 100 - input.anomalyCount * 10);

  const weighted =
    runwayScore * 0.4 +
    cfrScore * 0.2 +
    regScore * 0.15 +
    fcScore * 0.15 +
    anomScore * 0.1;
  return Math.round(Math.max(0, Math.min(100, weighted)));
}

function buildAlerts(input: {
  projection30: DailyProjection[];
  projection60: DailyProjection[];
  cashFlow: CashFlowMetrics;
  expenses: ExpenseAnalysis;
  totalBalance: number;
  alertThreshold: number;
}): TreasuryAlert[] {
  const alerts: TreasuryAlert[] = [];
  const seen = new Set<string>();
  function push(alert: TreasuryAlert) {
    if (seen.has(alert.type)) return;
    seen.add(alert.type);
    alerts.push(alert);
  }

  if (input.projection30.some((p) => p.projectedBalance < 0)) {
    push({
      type: "negative_balance",
      severity: "critical",
      message: "Le solde projeté passe sous zéro dans les 30 jours.",
    });
  } else if (input.projection30.some((p) => p.projectedBalance < input.alertThreshold)) {
    push({
      type: "low_balance",
      severity: "warning",
      message: `Le solde projeté tombe sous ${input.alertThreshold} € dans les 30 jours.`,
    });
  }
  if (
    input.cashFlow.burnRateNet > 0 &&
    input.totalBalance > 0 &&
    input.cashFlow.burnRateNet > input.totalBalance * 0.2
  ) {
    push({
      type: "high_burn",
      severity: "warning",
      message: "Burn rate élevé : > 20 % du solde consommé chaque mois.",
    });
  }
  // Income drop : dernier mois < 70 % de la moyenne des inflows
  const months = [...input.cashFlow.monthlyInflows.keys()].sort();
  if (months.length >= 3) {
    const lastMonthInflow = input.cashFlow.monthlyInflows.get(months[months.length - 1]!) ?? 0;
    if (
      input.cashFlow.averageMonthlyIncome > 0 &&
      lastMonthInflow < input.cashFlow.averageMonthlyIncome * 0.7
    ) {
      push({
        type: "income_drop",
        severity: "warning",
        message: "Encaissements du dernier mois < 70 % de la moyenne.",
      });
    }
  }
  if (input.expenses.anomalies.length > 0) {
    push({
      type: "anomaly_detected",
      severity: "info",
      message: `${input.expenses.anomalies.length} transaction(s) anormale(s) détectée(s).`,
    });
  }
  return alerts;
}

// ─── Utils internes ─────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}
