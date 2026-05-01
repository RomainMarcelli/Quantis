// File: services/integrations/adapters/bridge/__tests__/summaryBuilder.test.ts
// Role: tests sur l'orchestrateur `buildBankingSummary` — vérifie l'assemblage
// du BankingSummary (totalBalance, monthlyFlows borné à 12, recentTransactions
// triées desc, balanceHistory reconstruit à reculons).

import { describe, expect, it } from "vitest";
import { buildBankingSummary } from "@/services/integrations/adapters/bridge/summaryBuilder";
import type { BankAccount, BankTransaction } from "@/types/banking";

const asOf = new Date("2026-05-01T00:00:00Z");

function account(overrides: Partial<BankAccount> = {}): BankAccount {
  return {
    id: "acc-1",
    bridgeAccountId: 1,
    name: "Compte Pro",
    type: "checking",
    balance: 10000,
    currency: "EUR",
    providerName: "BNP Paribas",
    lastRefreshedAt: "2026-05-01T00:00:00Z",
    ...overrides,
  };
}

let txCounter = 0;
function tx(overrides: Partial<BankTransaction> = {}): BankTransaction {
  txCounter++;
  return {
    id: `tx-${txCounter}`,
    bridgeTransactionId: txCounter,
    accountId: "acc-1",
    amount: -100,
    date: "2026-04-15",
    description: "Test",
    operationType: "card",
    categoryId: 1,
    isFuture: false,
    ...overrides,
  };
}

describe("buildBankingSummary", () => {
  it("agrège totalBalance sur tous les comptes (incluant loans/cards négatifs)", () => {
    const summary = buildBankingSummary({
      accounts: [
        account({ id: "a1", balance: 8000 }),
        account({ id: "a2", balance: 2500, type: "savings" }),
        account({ id: "a3", balance: -500, type: "card" }),
      ],
      transactions: [],
      asOf,
    });
    expect(summary.totalBalance).toBe(10000);
    expect(summary.accounts).toHaveLength(3);
  });

  it("expose recentTransactions triées par date desc, fenêtre 90j incluse", () => {
    const summary = buildBankingSummary({
      accounts: [account()],
      transactions: [
        tx({ date: "2026-04-30", amount: 500 }),
        tx({ date: "2026-04-15", amount: -200 }),
        tx({ date: "2026-01-01", amount: -100 }), // hors fenêtre 90j
        tx({ date: "2026-05-15", amount: -300, isFuture: true }), // future incluse
      ],
      asOf,
    });
    expect(summary.recentTransactions).toHaveLength(3);
    // Tri desc : la plus récente en premier
    expect(summary.recentTransactions[0]?.date).toBe("2026-05-15");
    expect(summary.recentTransactions[1]?.date).toBe("2026-04-30");
    expect(summary.recentTransactions[2]?.date).toBe("2026-04-15");
  });

  it("borne monthlyFlows à 12 mois max", () => {
    const txs: BankTransaction[] = [];
    for (let m = 1; m <= 15; m++) {
      const month = String(m).padStart(2, "0");
      txs.push(tx({ date: `2025-${month}-15`, amount: 100 }));
    }
    const summary = buildBankingSummary({
      accounts: [account()],
      transactions: txs,
      asOf: new Date("2026-04-01T00:00:00Z"),
    });
    expect(summary.monthlyFlows.length).toBeLessThanOrEqual(12);
  });

  it("reconstruit balanceHistory à reculons depuis le solde courant", () => {
    // 3 mois de flux : Jan +1000, Fev -500, Mar +200. Solde courant = 5000.
    // Solde fin Fev = 5000 - 200 = 4800. Solde fin Jan = 4800 - (-500) = 5300.
    // Solde fin Déc = 5300 - 1000 = 4300.
    const summary = buildBankingSummary({
      accounts: [account({ balance: 5000 })],
      transactions: [
        tx({ date: "2026-01-15", amount: 1000 }),
        tx({ date: "2026-02-15", amount: -500 }),
        tx({ date: "2026-03-15", amount: 200 }),
      ],
      asOf: new Date("2026-04-01T00:00:00Z"),
    });
    expect(summary.balanceHistory).toHaveLength(4); // 3 mois + le mois courant
    // Le dernier point = mois courant avec totalBalance courant
    expect(summary.balanceHistory.at(-1)).toEqual({
      month: "2026-04",
      totalBalance: 5000,
    });
    // Mars : 5000 - 200 = 4800
    expect(summary.balanceHistory[2]?.totalBalance).toBe(4800);
    // Février : 4800 - (-500) = 5300
    expect(summary.balanceHistory[1]?.totalBalance).toBe(5300);
    // Janvier : 5300 - 1000 = 4300
    expect(summary.balanceHistory[0]?.totalBalance).toBe(4300);
  });

  it("balanceHistory vide quand pas de flux disponibles", () => {
    const summary = buildBankingSummary({
      accounts: [account({ balance: 5000 })],
      transactions: [],
      asOf,
    });
    expect(summary.balanceHistory).toEqual([]);
  });

  it("upcomingTransactions triées par date asc", () => {
    const summary = buildBankingSummary({
      accounts: [account()],
      transactions: [
        tx({ date: "2026-06-01", isFuture: true }),
        tx({ date: "2026-05-15", isFuture: true }),
        tx({ date: "2026-05-25", isFuture: true }),
      ],
      asOf,
    });
    expect(summary.upcomingTransactions.map((t) => t.date)).toEqual([
      "2026-05-15",
      "2026-05-25",
      "2026-06-01",
    ]);
  });
});
