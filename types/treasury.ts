// File: types/treasury.ts
// Role: types pour le moteur d'analyse trésorerie (`lib/treasury/treasuryEngine.ts`).
// Volontairement disjoints de `types/banking.ts` (qui décrit la donnée brute
// Bridge) — ici on est dans la couche dérivée : récurrences détectées,
// projections, métriques, alertes.

import type { BankAccount, BankTransaction } from "@/types/banking";

// ─── Récurrences ─────────────────────────────────────────────────────────

export type RecurringFrequency = "monthly" | "quarterly";
export type RecurringType = "expense" | "income";

export type RecurringTransaction = {
  /** Label original (le plus représentatif du groupe). */
  label: string;
  /** Label normalisé (lowercase, sans dates ni numéros — clé de groupage). */
  labelNormalized: string;
  /** Montant moyen sur les occurrences détectées (signé : négatif pour
   *  charges, positif pour revenus). */
  averageAmount: number;
  /** Période moyenne entre deux occurrences. */
  frequency: RecurringFrequency;
  /** Charge ou revenu — déduit du signe de averageAmount. */
  type: RecurringType;
  /** Nombre d'occurrences ayant servi à la détection. */
  occurrences: number;
  /** Indice de confiance 0-1 — combine régularité d'intervalle et stabilité
   *  du montant. 1 = mensualité parfaite (loyer fixe au jour près). */
  reliability: number;
  /** Prochaine occurrence estimée (= lastDate + frequency moyenne). */
  nextExpectedDate: Date;
  /** Dernière occurrence détectée. */
  lastDate: Date;
  /** Catégorie Bridge la plus fréquente sur les occurrences (0 si inconnue). */
  categoryId: number;
};

// ─── Projection ──────────────────────────────────────────────────────────

export type ProjectionEvent = {
  label: string;
  amount: number;
};

export type DailyProjection = {
  date: Date;
  /** Solde projeté en fin de journée. */
  projectedBalance: number;
  /** Récurrences appliquées ce jour-là (peut être vide). */
  events: ProjectionEvent[];
  /** True si le solde tombe sous le seuil d'alerte (paramétrable). */
  isAlert: boolean;
};

// ─── Cash flow ──────────────────────────────────────────────────────────

export type MonthKey = string; // "YYYY-MM"

export type CashFlowMetrics = {
  monthlyInflows: Map<MonthKey, number>;
  monthlyOutflows: Map<MonthKey, number>;
  netCashFlowByMonth: Map<MonthKey, number>;
  /** Moyenne des sorties sur les mois COMPLETS (≥ 28 jours d'observation). */
  averageMonthlyBurn: number;
  averageMonthlyIncome: number;
  /** = burn − income. Positif → on consomme du cash, négatif → on en génère. */
  burnRateNet: number;
  /** Solde courant / burn net mensuel ; null si on génère du cash. */
  runwayMonths: number | null;
  /** Encaissements moyens / décaissements moyens. > 1 = sain. */
  cashFlowRatio: number;
  /** 1 - (écartType inflows / moyenne inflows). 1 = très régulier. */
  incomeRegularityIndex: number;
};

// ─── Dépenses ───────────────────────────────────────────────────────────

export type ExpenseCategory = {
  /** Label de catégorie Bridge ou label normalisé fallback. */
  label: string;
  /** Total absolu sur la période d'analyse. */
  total: number;
  /** Pourcentage des dépenses totales (0-100). */
  pct: number;
  /** Variation vs le mois précédent en % (∞ si M-1 = 0, 0 si pas comparable). */
  trend: number;
};

export type ExpenseAnomaly = {
  transaction: BankTransaction;
  reason: string;
};

export type ExpenseAnalysis = {
  /** Top 10 catégories triées par montant absolu décroissant. */
  topCategories: ExpenseCategory[];
  /** Total mensuel des charges fixes (depuis récurrences). */
  fixedCharges: number;
  /** Total mensuel des charges non récurrentes. */
  variableCharges: number;
  /** charges fixes / charges totales mensuelles (0-1). */
  fixedChargesRatio: number;
  /** Transactions anormales détectées. */
  anomalies: ExpenseAnomaly[];
};

// ─── Jours critiques ────────────────────────────────────────────────────

export type CriticalDay = {
  /** Jour du mois (1-31). */
  dayOfMonth: number;
  /** Solde moyen ce jour-là sur les mois observés. */
  averageBalance: number;
  /** Labels des grosses sorties qui contribuent à ce creux. */
  causeLabels: string[];
};

// ─── Alertes ────────────────────────────────────────────────────────────

export type TreasuryAlertType =
  | "low_balance"
  | "negative_balance"
  | "high_burn"
  | "income_drop"
  | "anomaly_detected";

export type TreasuryAlert = {
  type: TreasuryAlertType;
  severity: "info" | "warning" | "critical";
  message: string;
};

// ─── Stress test ─────────────────────────────────────────────────────────

export type StressTestParams = {
  accounts: BankAccount[];
  transactions: BankTransaction[];
  recurring: RecurringTransaction[];
  scenario: {
    /** 0-1, ex. 0.3 = -30 % d'encaissements. */
    incomeReduction: number;
    /** Charge ponctuelle ajoutée (positive ou négative selon convention). */
    additionalExpense?: number;
    /** Montant mensuel d'un client perdu (sera retiré des récurrences). */
    lostClientAmount?: number;
    /** Durée du stress en mois. */
    durationMonths: number;
  };
  /** Seuil d'alerte pour `isAlert` (défaut 1000 €). */
  alertThreshold?: number;
};

// ─── Options & sortie principale ────────────────────────────────────────

export type TreasuryOptions = {
  /** Seuil "solde bas" pour les alertes / projections (défaut 1000 €). */
  alertThreshold?: number;
  /** Patterns de label qui désignent des virements internes (à exclure des
   *  flux). Ex. ["VIR INTERNE", "TRANSFERT VERS"]. */
  internalTransferPatterns?: string[];
  /** Date de référence pour les projections — défaut now(). Testable. */
  asOf?: Date;
};

export type TreasuryAnalysis = {
  /** Solde total agrégé des comptes. */
  totalBalance: number;
  recurring: RecurringTransaction[];
  projection30: DailyProjection[];
  projection60: DailyProjection[];
  projection90: DailyProjection[];
  cashFlow: CashFlowMetrics;
  expenses: ExpenseAnalysis;
  criticalDays: CriticalDay[];
  /** Score 0-100 (40 % runway, 20 % cashFlowRatio, 15 % regularity, 15 %
   *  fixedChargesRatio, 10 % anomalies). */
  healthScore: number;
  alerts: TreasuryAlert[];
};
