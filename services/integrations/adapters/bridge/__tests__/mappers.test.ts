// File: services/integrations/adapters/bridge/__tests__/mappers.test.ts
// Role: tests unitaires sur les mappers Bridge — purs, pas d'I/O. Couvre :
//   - mapBridgeAccountToInternal (types fallback, currency upper-case, banque)
//   - mapBridgeTransactionToInternal (signe + clean_description fallback)
//   - aggregateTransactionsByMonth (entrées/sorties séparées, futures ignorées)
//   - computeBurnRate (sortie nette / périodeDays, 0 quand cashflow positif)
//   - computeRunway (seuils 12/6 mois, ∞ si pas de burn)
//   - groupByCategory (sorties seulement, sort desc, fallback label)
//   - groupByOperationType (toutes confondues, sort desc)

import { describe, expect, it } from "vitest";
import {
  aggregateTransactionsByMonth,
  computeBurnRate,
  computeRunway,
  groupByCategory,
  groupByOperationType,
  mapBridgeAccountToInternal,
  mapBridgeTransactionToInternal,
} from "@/services/integrations/adapters/bridge/mappers";
import type {
  BridgeRawAccount,
  BridgeRawTransaction,
} from "@/services/integrations/adapters/bridge/fetchers";

const fixedId = () => "test-id";

describe("mapBridgeAccountToInternal", () => {
  it("map les champs principaux + uppercase la devise", () => {
    const raw: BridgeRawAccount = {
      id: 42,
      name: "  Compte Pro  ",
      type: "checking",
      balance: 12345.67,
      currency_code: "eur",
      iban: "FR76 0000 0000 0000",
      provider: { name: "BNP Paribas" },
      updated_at: "2026-01-15T10:00:00Z",
    };
    const result = mapBridgeAccountToInternal(raw, { idGenerator: fixedId });
    expect(result).toEqual({
      id: "test-id",
      bridgeAccountId: 42,
      name: "Compte Pro",
      type: "checking",
      balance: 12345.67,
      currency: "EUR",
      iban: "FR76 0000 0000 0000",
      providerName: "BNP Paribas",
      lastRefreshedAt: "2026-01-15T10:00:00Z",
    });
  });

  it("fallback type='other' si Bridge envoie un type inconnu", () => {
    const raw: BridgeRawAccount = {
      id: 1,
      name: "Livret PEA",
      type: "wealth_management",
      balance: 0,
      currency_code: "EUR",
    };
    expect(mapBridgeAccountToInternal(raw).type).toBe("other");
  });

  it("normalise credit_card → card et savings → savings", () => {
    expect(
      mapBridgeAccountToInternal({
        id: 1,
        name: "x",
        type: "credit_card",
        balance: 0,
        currency_code: "EUR",
      }).type
    ).toBe("card");
    expect(
      mapBridgeAccountToInternal({
        id: 2,
        name: "y",
        type: "savings",
        balance: 0,
        currency_code: "EUR",
      }).type
    ).toBe("savings");
  });

  it("nom fallback si Bridge envoie une chaîne vide", () => {
    const raw: BridgeRawAccount = {
      id: 99,
      name: "",
      type: "checking",
      balance: 0,
      currency_code: "EUR",
    };
    expect(mapBridgeAccountToInternal(raw).name).toBe("Compte 99");
  });
});

describe("mapBridgeTransactionToInternal", () => {
  it("préserve le signe (sortie négative) et utilise clean_description", () => {
    const raw: BridgeRawTransaction = {
      id: 100,
      account_id: 42,
      amount: -45.5,
      date: "2026-01-15",
      clean_description: "Carrefour",
      provider_description: "CB CARREFOUR 0114",
      operation_type: "card",
      category_id: 12,
      is_future: false,
    };
    const result = mapBridgeTransactionToInternal(raw, { idGenerator: fixedId });
    expect(result.amount).toBe(-45.5);
    expect(result.description).toBe("Carrefour");
    expect(result.rawDescription).toBe("CB CARREFOUR 0114");
    expect(result.operationType).toBe("card");
    expect(result.isFuture).toBe(false);
  });

  it("fallback sur provider_description si clean_description manque", () => {
    const raw: BridgeRawTransaction = {
      id: 1,
      account_id: 1,
      amount: 100,
      date: "2026-01-01",
      clean_description: null,
      provider_description: "VIR JANVIER",
      operation_type: null,
      category_id: 0,
      is_future: false,
    };
    const result = mapBridgeTransactionToInternal(raw);
    expect(result.description).toBe("VIR JANVIER");
    expect(result.operationType).toBe("unknown");
  });

  it("résout l'accountId via accountIdResolver si fourni", () => {
    const raw: BridgeRawTransaction = {
      id: 1,
      account_id: 42,
      amount: 0,
      date: "2026-01-01",
      category_id: 0,
    };
    const result = mapBridgeTransactionToInternal(raw, {
      accountIdResolver: (bid) => `internal-${bid}`,
    });
    expect(result.accountId).toBe("internal-42");
  });
});

describe("aggregateTransactionsByMonth", () => {
  it("agrège entrées/sorties par YYYY-MM, ignore les futures, trie ASC", () => {
    const txs = [
      makeTx({ amount: 1000, date: "2026-01-15" }),
      makeTx({ amount: -300, date: "2026-01-20" }),
      makeTx({ amount: -200, date: "2026-01-25" }),
      makeTx({ amount: 500, date: "2026-02-05" }),
      makeTx({ amount: -100, date: "2026-02-10" }),
      makeTx({ amount: -1000, date: "2026-03-01", is_future: true }),
    ];
    const result = aggregateTransactionsByMonth(txs);
    expect(result).toEqual([
      { month: "2026-01", totalIn: 1000, totalOut: 500, netFlow: 500 },
      { month: "2026-02", totalIn: 500, totalOut: 100, netFlow: 400 },
    ]);
  });

  it("retourne un tableau vide quand pas de transactions", () => {
    expect(aggregateTransactionsByMonth([])).toEqual([]);
  });
});

describe("computeBurnRate", () => {
  it("0/0 quand le cashflow net est positif", () => {
    const txs = [
      makeTx({ amount: 5000, date: "2026-01-10" }),
      makeTx({ amount: -1000, date: "2026-01-15" }),
    ];
    expect(computeBurnRate(txs, 30)).toEqual({ dailyBurn: 0, monthlyBurn: 0 });
  });

  it("calcule le burn quotidien et mensuel quand sortie nette > 0", () => {
    const txs = [
      makeTx({ amount: 1000, date: "2026-01-10" }),
      makeTx({ amount: -4000, date: "2026-01-15" }),
    ];
    // Net out = 4000 - 1000 = 3000 sur 30j = 100/jour, 3000/mois
    expect(computeBurnRate(txs, 30)).toEqual({ dailyBurn: 100, monthlyBurn: 3000 });
  });

  it("0/0 quand periodDays invalide", () => {
    const txs = [makeTx({ amount: -100, date: "2026-01-01" })];
    expect(computeBurnRate(txs, 0)).toEqual({ dailyBurn: 0, monthlyBurn: 0 });
    expect(computeBurnRate(txs, -10)).toEqual({ dailyBurn: 0, monthlyBurn: 0 });
  });

  it("ignore les transactions futures", () => {
    const txs = [
      makeTx({ amount: -1000, date: "2026-02-01", is_future: true }),
    ];
    expect(computeBurnRate(txs, 30)).toEqual({ dailyBurn: 0, monthlyBurn: 0 });
  });
});

describe("computeRunway", () => {
  it("safe + ∞ si pas de burn", () => {
    const result = computeRunway(50000, 0);
    expect(result.status).toBe("safe");
    expect(result.months).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("safe quand runway >= 12 mois", () => {
    expect(computeRunway(120000, 5000)).toEqual({ months: 24, status: "safe" });
    expect(computeRunway(60000, 5000)).toEqual({ months: 12, status: "safe" });
  });

  it("warning quand 6 <= runway < 12 mois", () => {
    expect(computeRunway(50000, 5000)).toEqual({ months: 10, status: "warning" });
    expect(computeRunway(30000, 5000)).toEqual({ months: 6, status: "warning" });
  });

  it("critical quand runway < 6 mois", () => {
    expect(computeRunway(20000, 5000)).toEqual({ months: 4, status: "critical" });
    expect(computeRunway(1000, 5000)).toEqual({ months: 0.2, status: "critical" });
  });
});

describe("groupByCategory", () => {
  it("agrège les SORTIES par catégorie, trie desc, résout les labels", () => {
    const txs = [
      makeTx({ amount: -50, category_id: 1 }),
      makeTx({ amount: -30, category_id: 1 }),
      makeTx({ amount: -100, category_id: 2 }),
      makeTx({ amount: 200, category_id: 3 }), // entrée → ignorée
    ];
    const result = groupByCategory(txs, [
      { id: 1, name: "Restaurants" },
      { id: 2, name: "Transport" },
    ]);
    expect(result).toEqual([
      { categoryId: 2, categoryLabel: "Transport", total: 100, count: 1 },
      { categoryId: 1, categoryLabel: "Restaurants", total: 80, count: 2 },
    ]);
  });

  it("fallback label 'Catégorie #X' quand catégorie inconnue", () => {
    const txs = [makeTx({ amount: -10, category_id: 999 })];
    const result = groupByCategory(txs, []);
    expect(result[0]?.categoryLabel).toBe("Catégorie #999");
  });
});

describe("groupByOperationType", () => {
  it("agrège tous types confondus en valeur absolue, trie desc", () => {
    const txs = [
      makeTx({ amount: -100, operation_type: "card" }),
      makeTx({ amount: -50, operation_type: "card" }),
      makeTx({ amount: 200, operation_type: "transfer" }),
      makeTx({ amount: -30, operation_type: null }),
    ];
    const result = groupByOperationType(txs);
    expect(result).toEqual([
      { type: "transfer", total: 200, count: 1 },
      { type: "card", total: 150, count: 2 },
      { type: "unknown", total: 30, count: 1 },
    ]);
  });
});

// ─── Helpers ────────────────────────────────────────────────────────────

let txCounter = 0;
function makeTx(overrides: Partial<BridgeRawTransaction>) {
  txCounter++;
  const raw: BridgeRawTransaction = {
    id: txCounter,
    account_id: 1,
    amount: 0,
    date: "2026-01-01",
    clean_description: `Tx ${txCounter}`,
    operation_type: "card",
    category_id: 0,
    is_future: false,
    ...overrides,
  };
  return mapBridgeTransactionToInternal(raw, { idGenerator: () => `tx-${txCounter}` });
}
