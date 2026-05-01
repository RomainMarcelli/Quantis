// File: lib/treasury/__tests__/treasuryEngine.test.ts
// Role: tests unitaires des fonctions du moteur trésorerie. Couvre les
// branches métier des 7 fonctions exposées + détection de récurrences.

import { describe, expect, it } from "vitest";
import {
  analyzeExpenses,
  analyzeTreasury,
  computeCashFlowMetrics,
  detectRecurringTransactions,
  findCriticalDays,
  normalizeLabel,
  projectBalance,
  stressTest,
} from "@/lib/treasury/treasuryEngine";
import {
  generateMockAccounts,
  generateMockTransactions,
} from "@/lib/treasury/__tests__/fixtures/generateBridgeData";
import type { BankAccount, BankTransaction } from "@/types/banking";

const ASOF = new Date("2026-05-01T00:00:00Z");

// ─── normalizeLabel ─────────────────────────────────────────────────────

describe("normalizeLabel", () => {
  it("retire les dates jj/mm/aaaa", () => {
    expect(normalizeLabel("PRLV URSSAF 04/2026")).toBe("prlv urssaf");
    expect(normalizeLabel("EDF 12/04/2026")).toBe("edf");
  });

  it("retire les références numériques longues", () => {
    expect(normalizeLabel("FACTURE 1234567890 BNP")).toBe("facture bnp");
  });

  it("retire les noms de mois français", () => {
    expect(normalizeLabel("LOYER MAI 2026")).toBe("loyer");
    expect(normalizeLabel("LOYER AVRIL")).toBe("loyer");
  });

  it("fallback à 'non catégorisé' quand label vide ou null", () => {
    expect(normalizeLabel("")).toBe("non catégorisé");
    expect(normalizeLabel(null)).toBe("non catégorisé");
    expect(normalizeLabel(undefined)).toBe("non catégorisé");
  });
});

// ─── detectRecurringTransactions ────────────────────────────────────────

describe("detectRecurringTransactions", () => {
  it("détecte un loyer mensuel (5 occurrences)", () => {
    const txs = generateMockTransactions({
      count: 50,
      months: 5,
      endDate: ASOF,
      patterns: [
        {
          label: "LOYER",
          amount: -2800,
          dayOfMonth: 5,
          frequency: "monthly",
          categoryId: 110,
        },
      ],
      seed: 1,
    });
    const recurring = detectRecurringTransactions(txs);
    const rent = recurring.find((r) => r.labelNormalized.includes("loyer"));
    expect(rent).toBeDefined();
    expect(rent?.frequency).toBe("monthly");
    expect(rent?.type).toBe("expense");
    expect(rent?.averageAmount).toBeCloseTo(-2800, 1);
    expect(rent?.occurrences).toBeGreaterThanOrEqual(5);
  });

  it("détecte un prélèvement trimestriel (TVA)", () => {
    const txs = generateMockTransactions({
      count: 30,
      months: 12,
      endDate: ASOF,
      patterns: [
        { label: "TVA TRIM", amount: -3500, dayOfMonth: 20, frequency: "quarterly", categoryId: 121 },
      ],
      seed: 2,
    });
    const recurring = detectRecurringTransactions(txs);
    const tva = recurring.find((r) => r.labelNormalized.includes("tva"));
    expect(tva).toBeDefined();
    expect(tva?.frequency).toBe("quarterly");
  });

  it("ne détecte PAS une transaction unique comme récurrente", () => {
    const txs: BankTransaction[] = [
      {
        id: "1",
        bridgeTransactionId: 1,
        accountId: "a1",
        amount: -100,
        date: "2026-04-01",
        description: "ACHAT UNIQUE",
        operationType: "card",
        categoryId: 1,
        isFuture: false,
      },
    ];
    expect(detectRecurringTransactions(txs)).toHaveLength(0);
  });

  it("ne détecte PAS 2 occurrences seulement comme récurrente", () => {
    const txs: BankTransaction[] = [
      makeTx(1, "ABO TEST", "2026-03-01", -50),
      makeTx(2, "ABO TEST", "2026-04-01", -50),
    ];
    expect(detectRecurringTransactions(txs)).toHaveLength(0);
  });

  it("gère les variantes de label (numéros de référence qui changent)", () => {
    const txs: BankTransaction[] = [
      makeTx(1, "PRLV URSSAF 02/2026 REF 123", "2026-02-15", -1850),
      makeTx(2, "PRLV URSSAF 03/2026 REF 124", "2026-03-15", -1850),
      makeTx(3, "PRLV URSSAF 04/2026 REF 125", "2026-04-15", -1850),
    ];
    const recurring = detectRecurringTransactions(txs);
    const urssaf = recurring.find((r) => r.labelNormalized.includes("urssaf"));
    expect(urssaf).toBeDefined();
    expect(urssaf?.occurrences).toBe(3);
  });

  it("gère les montants légèrement variables (salaires ±5€)", () => {
    const txs: BankTransaction[] = [
      makeTx(1, "SALAIRE", "2026-01-25", 8500.13),
      makeTx(2, "SALAIRE", "2026-02-25", 8497.42),
      makeTx(3, "SALAIRE", "2026-03-25", 8500.0),
      makeTx(4, "SALAIRE", "2026-04-25", 8501.85),
    ];
    const recurring = detectRecurringTransactions(txs);
    const salary = recurring.find((r) => r.labelNormalized.includes("salaire"));
    expect(salary).toBeDefined();
    expect(salary?.type).toBe("income");
  });
});

// ─── projectBalance ─────────────────────────────────────────────────────

describe("projectBalance", () => {
  it("solde plat sur 30 jours quand aucune récurrence", () => {
    const accounts: BankAccount[] = [
      { id: "a", bridgeAccountId: 1, name: "x", type: "checking", balance: 5000, currency: "EUR", providerName: "X", lastRefreshedAt: "2026-05-01" },
    ];
    const proj = projectBalance(accounts, [], [], 30, { asOf: ASOF });
    expect(proj).toHaveLength(30);
    expect(proj.every((p) => p.projectedBalance === 5000)).toBe(true);
  });

  it("applique les récurrences à la date attendue", () => {
    const accounts: BankAccount[] = [
      { id: "a", bridgeAccountId: 1, name: "x", type: "checking", balance: 10000, currency: "EUR", providerName: "X", lastRefreshedAt: "2026-05-01" },
    ];
    // Loyer -2800 le 5, salaire +8500 le 25
    const txs = generateMockTransactions({
      count: 24,
      months: 6,
      endDate: ASOF,
      patterns: [
        { label: "LOYER", amount: -2800, dayOfMonth: 5, frequency: "monthly", categoryId: 110 },
        { label: "SALAIRE", amount: 8500, dayOfMonth: 25, frequency: "monthly", categoryId: 200 },
      ],
      noRecurring: false,
      seed: 3,
    });
    const recurring = detectRecurringTransactions(txs);
    expect(recurring.length).toBeGreaterThan(0);
    const proj = projectBalance(accounts, txs, recurring, 30, { asOf: ASOF });
    // Au moins un jour devrait avoir un événement
    const anyEvent = proj.some((p) => p.events.length > 0);
    expect(anyEvent).toBe(true);
  });

  it("flag isAlert quand solde sous seuil", () => {
    const accounts: BankAccount[] = [
      { id: "a", bridgeAccountId: 1, name: "x", type: "checking", balance: 500, currency: "EUR", providerName: "X", lastRefreshedAt: "2026-05-01" },
    ];
    const proj = projectBalance(accounts, [], [], 5, { asOf: ASOF, alertThreshold: 1000 });
    expect(proj.every((p) => p.isAlert === true)).toBe(true);
  });
});

// ─── computeCashFlowMetrics ─────────────────────────────────────────────

describe("computeCashFlowMetrics", () => {
  it("calcule burn et runway corrects sur données simples", () => {
    // 5 mois de données : -2000 net par mois, solde 6000 → runway = 3 mois
    const txs: BankTransaction[] = [];
    for (let m = 0; m < 5; m++) {
      txs.push(makeTx(2 * m, "Sortie", `2026-0${m + 1}-15`, -3000));
      txs.push(makeTx(2 * m + 1, "Entrée", `2026-0${m + 1}-20`, 1000));
    }
    const metrics = computeCashFlowMetrics(txs, { totalBalance: 6000 });
    expect(metrics.averageMonthlyBurn).toBe(3000);
    expect(metrics.averageMonthlyIncome).toBe(1000);
    expect(metrics.burnRateNet).toBe(2000);
    expect(metrics.runwayMonths).toBe(3);
  });

  it("runway null quand on génère du cash", () => {
    const txs: BankTransaction[] = [
      makeTx(1, "Entrée 1", "2026-01-15", 5000),
      makeTx(2, "Entrée 2", "2026-02-15", 5000),
      makeTx(3, "Entrée 3", "2026-03-15", 5000),
      makeTx(4, "Sortie 1", "2026-01-20", -1000),
      makeTx(5, "Sortie 2", "2026-02-20", -1000),
      makeTx(6, "Sortie 3", "2026-03-20", -1000),
    ];
    const metrics = computeCashFlowMetrics(txs, { totalBalance: 10000 });
    expect(metrics.runwayMonths).toBeNull();
    expect(metrics.cashFlowRatio).toBeGreaterThan(1);
  });

  it("incomeRegularityIndex proche de 1 quand revenus identiques", () => {
    const txs: BankTransaction[] = [];
    for (let m = 0; m < 5; m++) {
      txs.push(makeTx(m, "Salaire", `2026-0${m + 1}-25`, 5000));
    }
    const metrics = computeCashFlowMetrics(txs);
    expect(metrics.incomeRegularityIndex).toBeGreaterThan(0.95);
  });

  it("incomeRegularityIndex bas quand revenus volatils", () => {
    const txs: BankTransaction[] = [
      makeTx(0, "X", "2026-01-15", 1000),
      makeTx(1, "X", "2026-02-15", 9000),
      makeTx(2, "X", "2026-03-15", 500),
      makeTx(3, "X", "2026-04-15", 8000),
      makeTx(4, "X", "2026-05-15", 2000),
    ];
    const metrics = computeCashFlowMetrics(txs);
    expect(metrics.incomeRegularityIndex).toBeLessThan(0.5);
  });

  it("exclut les virements internes via patterns", () => {
    const txs: BankTransaction[] = [
      makeTx(1, "VIR INTERNE EPARGNE", "2026-03-15", -5000),
      makeTx(2, "VIR INTERNE EPARGNE", "2026-04-15", -5000),
      makeTx(3, "VIR INTERNE EPARGNE", "2026-05-15", -5000),
      makeTx(4, "Achat normal", "2026-04-10", -100),
    ];
    const metrics = computeCashFlowMetrics(txs, {
      internalTransferPatterns: ["VIR INTERNE"],
    });
    // Sortie totale = 100€ au lieu de 15100€
    const totalOut = [...metrics.monthlyOutflows.values()].reduce((a, b) => a + b, 0);
    expect(totalOut).toBe(100);
  });
});

// ─── analyzeExpenses ────────────────────────────────────────────────────

describe("analyzeExpenses", () => {
  it("trie le top par montant absolu décroissant", () => {
    const txs: BankTransaction[] = [
      makeTx(1, "Loyer", "2026-04-05", -2800),
      makeTx(2, "Restaurant", "2026-04-10", -50),
      makeTx(3, "EDF", "2026-04-12", -180),
      makeTx(4, "Restaurant", "2026-04-20", -45),
    ];
    const analysis = analyzeExpenses(txs);
    expect(analysis.topCategories[0]?.label).toBe("loyer");
    expect(analysis.topCategories[0]?.total).toBe(2800);
  });

  it("détecte une anomalie (transaction × 3 la moyenne du label)", () => {
    const txs: BankTransaction[] = [
      makeTx(1, "Restaurant", "2026-04-01", -50),
      makeTx(2, "Restaurant", "2026-04-05", -55),
      makeTx(3, "Restaurant", "2026-04-10", -45),
      makeTx(4, "Restaurant", "2026-04-15", -180), // anomalie
    ];
    const analysis = analyzeExpenses(txs);
    expect(analysis.anomalies.length).toBeGreaterThan(0);
    expect(analysis.anomalies[0]?.transaction.id).toBe("4");
  });

  it("fixedChargesRatio tient compte des récurrences", () => {
    const txs: BankTransaction[] = [];
    // Loyer fixe + restaurants à montants variés (pour ne PAS être détectés
    // comme récurrents — sinon le test devient ambigu).
    const restaurantAmounts = [-50, -75, -42, -88, -55];
    for (let m = 1; m <= 5; m++) {
      txs.push(makeTx(m * 2, "Loyer", `2026-0${m}-05`, -2800));
      txs.push(makeTx(m * 2 + 1, `Restaurant ${m}`, `2026-0${m}-10`, restaurantAmounts[m - 1]!));
    }
    const recurring = detectRecurringTransactions(txs);
    const analysis = analyzeExpenses(txs, recurring);
    expect(analysis.fixedCharges).toBeCloseTo(2800, 0);
    expect(analysis.fixedChargesRatio).toBeGreaterThan(0.9);
  });
});

// ─── findCriticalDays ──────────────────────────────────────────────────

describe("findCriticalDays", () => {
  it("identifie les 3 jours du mois les plus bas", () => {
    const txs = generateMockTransactions({
      count: 60,
      months: 4,
      endDate: ASOF,
      seed: 7,
    });
    const days = findCriticalDays(txs);
    expect(days.length).toBeLessThanOrEqual(3);
    if (days.length >= 2) {
      expect(days[0]!.averageBalance).toBeLessThanOrEqual(days[1]!.averageBalance);
    }
  });

  it("retourne [] sur données vides", () => {
    expect(findCriticalDays([])).toEqual([]);
  });
});

// ─── stressTest ────────────────────────────────────────────────────────

describe("stressTest", () => {
  const accounts: BankAccount[] = [
    { id: "a", bridgeAccountId: 1, name: "x", type: "checking", balance: 10000, currency: "EUR", providerName: "X", lastRefreshedAt: "2026-05-01" },
  ];

  it("scénario 0 % réduction → projection identique au baseline", () => {
    const txs = generateMockTransactions({ count: 30, months: 4, endDate: ASOF, seed: 11 });
    const recurring = detectRecurringTransactions(txs);
    const baseline = projectBalance(accounts, txs, recurring, 90, { asOf: ASOF });
    const stressed = stressTest({
      accounts,
      transactions: txs,
      recurring,
      scenario: { incomeReduction: 0, durationMonths: 3 },
      asOf: ASOF,
    });
    expect(stressed[stressed.length - 1]?.projectedBalance).toBeCloseTo(
      baseline[baseline.length - 1]?.projectedBalance ?? 0,
      0
    );
  });

  it("scénario -30 % revenus → solde final inférieur au baseline", () => {
    const txs = generateMockTransactions({
      count: 60,
      months: 6,
      endDate: ASOF,
      patterns: [
        { label: "SALAIRE", amount: 5000, dayOfMonth: 25, frequency: "monthly", categoryId: 200 },
        { label: "LOYER", amount: -2000, dayOfMonth: 5, frequency: "monthly", categoryId: 110 },
      ],
      seed: 12,
    });
    const recurring = detectRecurringTransactions(txs);
    const baseline = projectBalance(accounts, txs, recurring, 90, { asOf: ASOF });
    const stressed = stressTest({
      accounts,
      transactions: txs,
      recurring,
      scenario: { incomeReduction: 0.3, durationMonths: 3 },
      asOf: ASOF,
    });
    const baselineEnd = baseline[baseline.length - 1]?.projectedBalance ?? 0;
    const stressedEnd = stressed[stressed.length - 1]?.projectedBalance ?? 0;
    expect(stressedEnd).toBeLessThan(baselineEnd);
  });

  it("charge ponctuelle décale le solde de tout le montant", () => {
    const txs: BankTransaction[] = [];
    const stressed = stressTest({
      accounts,
      transactions: txs,
      recurring: [],
      scenario: { incomeReduction: 0, durationMonths: 1, additionalExpense: 3000 },
      asOf: ASOF,
    });
    expect(stressed[0]?.projectedBalance).toBe(10000 - 3000);
    expect(stressed[stressed.length - 1]?.projectedBalance).toBe(10000 - 3000);
  });
});

// ─── analyzeTreasury (orchestrateur) ───────────────────────────────────

describe("analyzeTreasury", () => {
  it("retourne une analyse complète sur un dataset réaliste", () => {
    const accounts = generateMockAccounts(3, 10);
    const transactions = generateMockTransactions({ count: 200, months: 5, endDate: ASOF, seed: 13 });
    const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
    const analysis = analyzeTreasury(
      { accounts, transactions, totalBalance, recentTransactions: transactions } as never,
      { asOf: ASOF }
    );
    expect(analysis.totalBalance).toBe(totalBalance);
    expect(analysis.projection30).toHaveLength(30);
    expect(analysis.projection60).toHaveLength(60);
    expect(analysis.projection90).toHaveLength(90);
    expect(analysis.healthScore).toBeGreaterThanOrEqual(0);
    expect(analysis.healthScore).toBeLessThanOrEqual(100);
  });

  it("génère une alerte negative_balance si projection passe sous 0", () => {
    const accounts: BankAccount[] = [
      { id: "a", bridgeAccountId: 1, name: "x", type: "checking", balance: 100, currency: "EUR", providerName: "X", lastRefreshedAt: "2026-05-01" },
    ];
    // Loyer -2800 récurrent → solde fortement négatif rapidement
    const txs = generateMockTransactions({
      count: 30,
      months: 5,
      endDate: ASOF,
      patterns: [{ label: "LOYER", amount: -2800, dayOfMonth: 5, frequency: "monthly", categoryId: 110 }],
      seed: 14,
    });
    const analysis = analyzeTreasury(
      { accounts, transactions: txs, totalBalance: 100 } as never,
      { asOf: ASOF }
    );
    const hasNegativeAlert = analysis.alerts.some((a) => a.type === "negative_balance");
    expect(hasNegativeAlert).toBe(true);
  });
});

// ─── helpers ────────────────────────────────────────────────────────────

function makeTx(id: number, description: string, date: string, amount: number): BankTransaction {
  return {
    id: String(id),
    bridgeTransactionId: id,
    accountId: "a1",
    amount,
    date,
    description,
    operationType: amount >= 0 ? "transfer" : "card",
    categoryId: 0,
    isFuture: false,
  };
}
