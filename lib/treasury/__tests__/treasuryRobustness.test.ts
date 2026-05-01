// File: lib/treasury/__tests__/treasuryRobustness.test.ts
// Role: tests de robustesse, edge cases, performances. Le moteur trésorerie
// doit ABSORBER tous les jeux de données dégradés (vide, corrompus, énormes,
// mal triés) sans crasher ni produire de NaN.

import { describe, expect, it } from "vitest";
import {
  analyzeExpenses,
  analyzeTreasury,
  computeCashFlowMetrics,
  detectRecurringTransactions,
  findCriticalDays,
  projectBalance,
  stressTest,
} from "@/lib/treasury/treasuryEngine";
import {
  generateMockAccounts,
  generateMockTransactions,
} from "@/lib/treasury/__tests__/fixtures/generateBridgeData";
import type { BankAccount, BankTransaction } from "@/types/banking";

const ASOF = new Date("2026-05-01T00:00:00Z");

// ─── Performance ────────────────────────────────────────────────────────

describe("Performance", () => {
  it("339 transactions (volume sandbox actuel) → < 100ms", () => {
    const txs = generateMockTransactions({ count: 339, months: 5, endDate: ASOF, seed: 1 });
    const accounts = generateMockAccounts(6, 1);
    const start = performance.now();
    analyzeTreasury({ accounts, transactions: txs, recentTransactions: txs } as never, { asOf: ASOF });
    expect(performance.now() - start).toBeLessThan(100);
  });

  it("1 000 transactions → < 200ms", () => {
    const txs = generateMockTransactions({ count: 1000, months: 6, endDate: ASOF, seed: 2 });
    const accounts = generateMockAccounts(5, 2);
    const start = performance.now();
    analyzeTreasury({ accounts, transactions: txs, recentTransactions: txs } as never, { asOf: ASOF });
    expect(performance.now() - start).toBeLessThan(200);
  });

  it("5 000 transactions → < 500ms", () => {
    const txs = generateMockTransactions({ count: 5000, months: 12, endDate: ASOF, seed: 3 });
    const accounts = generateMockAccounts(5, 3);
    const start = performance.now();
    analyzeTreasury({ accounts, transactions: txs, recentTransactions: txs } as never, { asOf: ASOF });
    expect(performance.now() - start).toBeLessThan(500);
  });

  it("10 000 transactions → < 1s", () => {
    const txs = generateMockTransactions({ count: 10_000, months: 24, endDate: ASOF, seed: 4 });
    const accounts = generateMockAccounts(5, 4);
    const start = performance.now();
    analyzeTreasury({ accounts, transactions: txs, recentTransactions: txs } as never, { asOf: ASOF });
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it("50 000 transactions → < 3s", () => {
    const txs = generateMockTransactions({ count: 50_000, months: 60, endDate: ASOF, seed: 5 });
    const accounts = generateMockAccounts(8, 5);
    const start = performance.now();
    analyzeTreasury({ accounts, transactions: txs, recentTransactions: txs } as never, { asOf: ASOF });
    expect(performance.now() - start).toBeLessThan(3000);
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────

describe("Edge cases", () => {
  it("0 transactions → métriques neutres, pas de NaN", () => {
    const accounts = generateMockAccounts(2, 1);
    const result = analyzeTreasury({ accounts, transactions: [] } as never, { asOf: ASOF });
    expect(result.recurring).toEqual([]);
    expect(result.cashFlow.averageMonthlyBurn).toBe(0);
    expect(result.cashFlow.runwayMonths).toBeNull();
    expect(Number.isFinite(result.healthScore)).toBe(true);
    expect(result.healthScore).toBeGreaterThanOrEqual(0);
    expect(result.healthScore).toBeLessThanOrEqual(100);
  });

  it("1 seule transaction → fonctionne, récurrences vides", () => {
    const txs: BankTransaction[] = [
      {
        id: "1",
        bridgeTransactionId: 1,
        accountId: "a1",
        amount: -100,
        date: "2026-04-15",
        description: "Achat unique",
        operationType: "card",
        categoryId: 1,
        isFuture: false,
      },
    ];
    const accounts = generateMockAccounts(1, 9);
    const result = analyzeTreasury({ accounts, transactions: txs } as never, { asOf: ASOF });
    expect(result.recurring).toEqual([]);
  });

  it("toutes les transactions le même jour → pas de division par zéro", () => {
    const txs: BankTransaction[] = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      bridgeTransactionId: i,
      accountId: "a1",
      amount: -50,
      date: "2026-04-15",
      description: "Same day",
      operationType: "card",
      categoryId: 0,
      isFuture: false,
    }));
    const accounts = generateMockAccounts(1, 10);
    expect(() => analyzeTreasury({ accounts, transactions: txs } as never, { asOf: ASOF })).not.toThrow();
  });

  it("transactions avec montant 0 → ignorées", () => {
    const txs: BankTransaction[] = [
      { id: "1", bridgeTransactionId: 1, accountId: "a1", amount: 0, date: "2026-04-15", description: "Zero", operationType: "card", categoryId: 0, isFuture: false },
    ];
    const result = computeCashFlowMetrics(txs);
    expect(result.monthlyInflows.size).toBe(0);
    expect(result.monthlyOutflows.size).toBe(0);
  });

  it("label vide ou null → groupe 'non catégorisé'", () => {
    const txs: BankTransaction[] = [
      { id: "1", bridgeTransactionId: 1, accountId: "a1", amount: -50, date: "2026-04-15", description: "", operationType: "card", categoryId: 0, isFuture: false },
      { id: "2", bridgeTransactionId: 2, accountId: "a1", amount: -50, date: "2026-04-20", description: "", operationType: "card", categoryId: 0, isFuture: false },
    ];
    const analysis = analyzeExpenses(txs);
    expect(analysis.topCategories.length).toBeGreaterThan(0);
    expect(analysis.topCategories[0]?.label).toBe("non catégorisé");
  });

  it("transactions dans le désordre → tri interne, pas d'erreur", () => {
    const txs: BankTransaction[] = [
      { id: "3", bridgeTransactionId: 3, accountId: "a1", amount: -50, date: "2026-04-25", description: "C", operationType: "card", categoryId: 0, isFuture: false },
      { id: "1", bridgeTransactionId: 1, accountId: "a1", amount: -50, date: "2026-04-05", description: "A", operationType: "card", categoryId: 0, isFuture: false },
      { id: "2", bridgeTransactionId: 2, accountId: "a1", amount: -50, date: "2026-04-15", description: "B", operationType: "card", categoryId: 0, isFuture: false },
    ];
    expect(() => detectRecurringTransactions(txs)).not.toThrow();
  });

  it("comptes avec solde négatif → solde total correct (peut être négatif)", () => {
    const accounts: BankAccount[] = [
      { id: "a1", bridgeAccountId: 1, name: "Courant", type: "checking", balance: 5000, currency: "EUR", providerName: "X", lastRefreshedAt: "2026-05-01" },
      { id: "a2", bridgeAccountId: 2, name: "Découvert", type: "checking", balance: -8000, currency: "EUR", providerName: "X", lastRefreshedAt: "2026-05-01" },
    ];
    const result = analyzeTreasury({ accounts, transactions: [] } as never, { asOf: ASOF });
    expect(result.totalBalance).toBe(-3000);
  });

  it("0 comptes → solde total = 0, projection depuis 0", () => {
    const result = analyzeTreasury({ accounts: [], transactions: [] } as never, { asOf: ASOF });
    expect(result.totalBalance).toBe(0);
    expect(result.projection30).toHaveLength(30);
    expect(result.projection30[0]?.projectedBalance).toBe(0);
  });
});

// ─── Données corrompues ────────────────────────────────────────────────

describe("Corrupted data", () => {
  it("transaction avec date invalide → ignorée", () => {
    const txs: BankTransaction[] = [
      { id: "1", bridgeTransactionId: 1, accountId: "a1", amount: -50, date: "not-a-date", description: "X", operationType: "card", categoryId: 0, isFuture: false },
      { id: "2", bridgeTransactionId: 2, accountId: "a1", amount: -50, date: "2026-04-15", description: "Y", operationType: "card", categoryId: 0, isFuture: false },
    ];
    expect(() => detectRecurringTransactions(txs)).not.toThrow();
    const result = computeCashFlowMetrics(txs);
    // Une seule transaction valide → un seul mois
    expect(result.monthlyOutflows.size).toBe(1);
  });

  it("transaction avec montant NaN → ignorée", () => {
    const txs: BankTransaction[] = [
      { id: "1", bridgeTransactionId: 1, accountId: "a1", amount: NaN, date: "2026-04-15", description: "X", operationType: "card", categoryId: 0, isFuture: false },
      { id: "2", bridgeTransactionId: 2, accountId: "a1", amount: -50, date: "2026-04-20", description: "Y", operationType: "card", categoryId: 0, isFuture: false },
    ];
    const result = computeCashFlowMetrics(txs);
    const totalOut = [...result.monthlyOutflows.values()].reduce((a, b) => a + b, 0);
    expect(totalOut).toBe(50);
  });

  it("transaction avec montant Infinity → ignorée", () => {
    const txs: BankTransaction[] = [
      { id: "1", bridgeTransactionId: 1, accountId: "a1", amount: Infinity, date: "2026-04-15", description: "X", operationType: "card", categoryId: 0, isFuture: false },
    ];
    expect(() => analyzeExpenses(txs)).not.toThrow();
  });

  it("doublon exact (même id) → dédupliqué", () => {
    const txs: BankTransaction[] = [
      { id: "1", bridgeTransactionId: 1, accountId: "a1", amount: -50, date: "2026-04-15", description: "Same", operationType: "card", categoryId: 0, isFuture: false },
      { id: "1", bridgeTransactionId: 1, accountId: "a1", amount: -50, date: "2026-04-15", description: "Same", operationType: "card", categoryId: 0, isFuture: false },
    ];
    const result = computeCashFlowMetrics(txs);
    const totalOut = [...result.monthlyOutflows.values()].reduce((a, b) => a + b, 0);
    expect(totalOut).toBe(50); // pas 100 — dédupliqué
  });
});

// ─── Cohérence ──────────────────────────────────────────────────────────

describe("Cohérence", () => {
  it("healthScore toujours entre 0 et 100", () => {
    const cases = [
      { count: 0, accounts: 0 },
      { count: 50, accounts: 1 },
      { count: 200, accounts: 5 },
      { count: 1000, accounts: 8 },
    ];
    for (const { count, accounts } of cases) {
      const txs = count > 0 ? generateMockTransactions({ count, months: 6, endDate: ASOF, seed: count }) : [];
      const accs = accounts > 0 ? generateMockAccounts(accounts, count + 1) : [];
      const result = analyzeTreasury({ accounts: accs, transactions: txs } as never, { asOf: ASOF });
      expect(result.healthScore).toBeGreaterThanOrEqual(0);
      expect(result.healthScore).toBeLessThanOrEqual(100);
    }
  });

  it("runway toujours >= 0 ou null", () => {
    for (let seed = 1; seed <= 5; seed++) {
      const txs = generateMockTransactions({ count: 200, months: 5, endDate: ASOF, seed });
      const accounts = generateMockAccounts(3, seed);
      const result = analyzeTreasury({ accounts, transactions: txs } as never, { asOf: ASOF });
      if (result.cashFlow.runwayMonths !== null) {
        expect(result.cashFlow.runwayMonths).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("pourcentages topCategories ≤ 100 cumulés (top 10)", () => {
    const txs = generateMockTransactions({ count: 500, months: 6, endDate: ASOF, seed: 11 });
    const result = analyzeExpenses(txs);
    const sumPct = result.topCategories.reduce((s, c) => s + c.pct, 0);
    // Le top 10 ne couvre pas forcément 100 % (queue longue) — mais doit
    // être borné à 100 ± 1 %.
    expect(sumPct).toBeLessThanOrEqual(101);
  });

  it("alertes sans doublon", () => {
    const accounts: BankAccount[] = [
      { id: "a", bridgeAccountId: 1, name: "x", type: "checking", balance: 100, currency: "EUR", providerName: "X", lastRefreshedAt: "2026-05-01" },
    ];
    const txs = generateMockTransactions({
      count: 30,
      months: 5,
      endDate: ASOF,
      patterns: [{ label: "LOYER", amount: -2800, dayOfMonth: 5, frequency: "monthly", categoryId: 110 }],
      seed: 99,
    });
    const result = analyzeTreasury({ accounts, transactions: txs } as never, { asOf: ASOF });
    const types = result.alerts.map((a) => a.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it("findCriticalDays + projectBalance + stressTest sur le même dataset → pas de NaN", () => {
    const txs = generateMockTransactions({ count: 100, months: 4, endDate: ASOF, seed: 7 });
    const accounts = generateMockAccounts(2, 7);
    const recurring = detectRecurringTransactions(txs);
    const days = findCriticalDays(txs);
    const proj = projectBalance(accounts, txs, recurring, 30, { asOf: ASOF });
    const stressed = stressTest({
      accounts,
      transactions: txs,
      recurring,
      scenario: { incomeReduction: 0.2, durationMonths: 2 },
      asOf: ASOF,
    });
    for (const d of days) expect(Number.isFinite(d.averageBalance)).toBe(true);
    for (const p of proj) expect(Number.isFinite(p.projectedBalance)).toBe(true);
    for (const p of stressed) expect(Number.isFinite(p.projectedBalance)).toBe(true);
  });
});
