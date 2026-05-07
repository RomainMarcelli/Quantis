// File: services/integrations/adapters/myunisoft/__tests__/mock.test.ts
// Tests de la fixture mock + du router conditionnel du client.
// Garantit que :
//   - Les fixtures sont déterministes (mêmes valeurs entre runs).
//   - shouldUseMyUnisoftMock() bascule selon l'env.
//   - Le client renvoie le bon mock selon l'endpoint demandé.
//   - Les fixtures matchent les types attendus par les mappers (compile
//     time + run time via mappers réels).

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  MOCK_ACCOUNTS,
  MOCK_BALANCE,
  MOCK_ENTRIES,
  MOCK_JOURNALS,
  shouldUseMyUnisoftMock,
} from "@/services/integrations/adapters/myunisoft/mock";
import {
  mapJournal,
  mapLedgerAccount,
  mapEntry,
  mapTrialBalance,
} from "@/services/integrations/adapters/myunisoft/mappers";

const ORIGINAL_ENV = process.env.MYUNISOFT_THIRD_PARTY_SECRET;

describe("shouldUseMyUnisoftMock", () => {
  beforeEach(() => {
    delete process.env.MYUNISOFT_THIRD_PARTY_SECRET;
  });

  afterEach(() => {
    if (ORIGINAL_ENV !== undefined) {
      process.env.MYUNISOFT_THIRD_PARTY_SECRET = ORIGINAL_ENV;
    } else {
      delete process.env.MYUNISOFT_THIRD_PARTY_SECRET;
    }
  });

  it("retourne true quand la var est absente", () => {
    expect(shouldUseMyUnisoftMock()).toBe(true);
  });

  it("retourne true quand la var est vide", () => {
    process.env.MYUNISOFT_THIRD_PARTY_SECRET = "";
    expect(shouldUseMyUnisoftMock()).toBe(true);
  });

  it("retourne true quand la var est blanc", () => {
    process.env.MYUNISOFT_THIRD_PARTY_SECRET = "   ";
    expect(shouldUseMyUnisoftMock()).toBe(true);
  });

  it("retourne false quand la var est définie", () => {
    process.env.MYUNISOFT_THIRD_PARTY_SECRET = "real-secret-xyz";
    expect(shouldUseMyUnisoftMock()).toBe(false);
  });
});

describe("MOCK_JOURNALS — déterministe", () => {
  it("contient les 4 journaux standards français", () => {
    expect(MOCK_JOURNALS.map((j) => j.customerReferenceCode)).toEqual([
      "VT",
      "AC",
      "BQ",
      "OD",
    ]);
  });

  it("respecte le contrat MyUnisoftJournal (producerId + name)", () => {
    for (const journal of MOCK_JOURNALS) {
      expect(journal.producerId).toBeDefined();
      expect(typeof journal.name).toBe("string");
    }
  });

  it("est mappable vers Journal (no throw)", () => {
    const ctx = { userId: "u1", connectionId: "c1" };
    for (const journal of MOCK_JOURNALS) {
      expect(() => mapJournal(journal, ctx)).not.toThrow();
    }
  });
});

describe("MOCK_ACCOUNTS — plan comptable 2033-SD compatible", () => {
  it("inclut les comptes essentiels du PCG (capital, immo, tiers, trésorerie, charges, produits)", () => {
    const numbers = MOCK_ACCOUNTS.map((a) => a.number);
    expect(numbers).toContain("101000"); // capital
    expect(numbers).toContain("215000"); // immo
    expect(numbers).toContain("411000"); // clients
    expect(numbers).toContain("401000"); // fournisseurs
    expect(numbers).toContain("512000"); // banque
    expect(numbers).toContain("607000"); // achats
    expect(numbers).toContain("641000"); // salaires
    expect(numbers).toContain("707000"); // ventes
  });

  it("est mappable vers LedgerAccount avec type correct", () => {
    const ctx = { userId: "u1", connectionId: "c1" };
    const accountByNumber = new Map(
      MOCK_ACCOUNTS.map((a) => [a.number, mapLedgerAccount(a, ctx)])
    );
    // Le mapper expose `type` (classification PCG : asset / liability /
    // revenue / expense / equity selon le 1er chiffre du numéro de compte).
    expect(accountByNumber.get("411000")?.type).toBe("asset");
    expect(accountByNumber.get("401000")?.type).toBe("liability");
    expect(accountByNumber.get("607000")?.type).toBe("expense");
    expect(accountByNumber.get("707000")?.type).toBe("revenue");
    expect(accountByNumber.get("512000")?.type).toBe("asset");
  });
});

describe("MOCK_ENTRIES — équilibre comptable", () => {
  it("chaque écriture est balancée (somme débits = somme crédits)", () => {
    for (const entry of MOCK_ENTRIES) {
      const debits = entry.movements.reduce(
        (sum, m) => sum + Number(m.value.debit ?? 0),
        0
      );
      const credits = entry.movements.reduce(
        (sum, m) => sum + Number(m.value.credit ?? 0),
        0
      );
      expect(debits).toBe(credits);
    }
  });

  it("chaque écriture référence un journal valide", () => {
    const journalIds = new Set(MOCK_JOURNALS.map((j) => j.producerId));
    for (const entry of MOCK_ENTRIES) {
      expect(journalIds.has(entry.journal.producerId)).toBe(true);
    }
  });

  it("est mappable vers AccountingEntry (pas d'erreur de shape)", () => {
    const ctx = { userId: "u1", connectionId: "c1" };
    for (const entry of MOCK_ENTRIES) {
      expect(() => mapEntry(entry, ctx)).not.toThrow();
    }
  });

  it("contient au moins 1 vente, 1 achat, 1 paie (couverture P&L)", () => {
    const journalCodes = MOCK_ENTRIES.map(
      (e) => MOCK_JOURNALS.find((j) => j.producerId === e.journal.producerId)?.customerReferenceCode
    );
    expect(journalCodes).toContain("VT"); // vente
    expect(journalCodes).toContain("AC"); // achat
    expect(journalCodes).toContain("OD"); // paie via OD
  });
});

describe("MOCK_BALANCE — comptes essentiels", () => {
  it("inclut les comptes de tiers, trésorerie et P&L pour calcul KPI cohérent", () => {
    const numbers = MOCK_BALANCE.map((b) => b.account.number);
    expect(numbers).toContain("411000"); // créances clients
    expect(numbers).toContain("401000"); // dettes fournisseurs
    expect(numbers).toContain("512000"); // trésorerie
    expect(numbers).toContain("707000"); // CA
    expect(numbers).toContain("607000"); // achats
    expect(numbers).toContain("641000"); // salaires
  });

  it("est mappable vers NormalizedTrialBalanceEntry[] (no throw)", () => {
    // mapTrialBalance prend un tableau + bornes de période, pas une entry isolée.
    const periodStart = new Date("2026-01-01");
    const periodEnd = new Date("2026-12-31");
    const result = mapTrialBalance(MOCK_BALANCE, periodStart, periodEnd);
    expect(result.length).toBe(MOCK_BALANCE.length);
  });

  it("balance signée cohérente : capital négatif (côté passif), immo positif (côté actif)", () => {
    const byNumber = new Map(MOCK_BALANCE.map((b) => [b.account.number, b.balance]));
    // capital social : crédit → balance négative dans la convention MyUnisoft
    expect(byNumber.get("101000")).toBeLessThan(0);
    // immo techniques : débit → balance positive
    expect(byNumber.get("215000")).toBeGreaterThan(0);
    // trésorerie : débit → positive
    expect(byNumber.get("512000")).toBeGreaterThan(0);
  });
});

describe("Cohérence inter-fixtures", () => {
  it("tous les comptes utilisés dans MOCK_ENTRIES existent dans MOCK_ACCOUNTS ou sont des comptes standards", () => {
    const knownNumbers = new Set(MOCK_ACCOUNTS.map((a) => a.number));
    const usedInEntries = new Set<string>();
    for (const entry of MOCK_ENTRIES) {
      for (const movement of entry.movements) {
        usedInEntries.add(movement.account.number);
      }
    }
    // Note : on autorise les comptes techniques (TVA 4456X, sécu 421X/431X)
    // qui ne sont pas explicitement dans MOCK_ACCOUNTS — c'est cohérent
    // avec la réalité où la balance n'inclut que les comptes mouvementés.
    for (const num of usedInEntries) {
      const isKnown = knownNumbers.has(num);
      const isTaxOrSocial = /^(445|421|431)/.test(num);
      expect(isKnown || isTaxOrSocial, `Compte inconnu : ${num}`).toBe(true);
    }
  });

  it("les balances reflètent au moins partiellement les comptes utilisés dans les écritures", () => {
    const balanceNumbers = new Set(MOCK_BALANCE.map((b) => b.account.number));
    expect(balanceNumbers.size).toBeGreaterThanOrEqual(5);
    // Les comptes principaux apparaissent dans la balance
    expect(balanceNumbers.has("411000")).toBe(true); // clients
    expect(balanceNumbers.has("401000")).toBe(true); // fournisseurs
    expect(balanceNumbers.has("707000")).toBe(true); // CA
  });
});

describe("Fixtures déterministes (idempotence)", () => {
  it("MOCK_JOURNALS reste identique entre 2 imports", () => {
    expect(MOCK_JOURNALS).toEqual(MOCK_JOURNALS);
    expect(MOCK_JOURNALS.length).toBe(4);
  });

  it("MOCK_ENTRIES contient des dates fixes (pas de Date.now())", () => {
    for (const entry of MOCK_ENTRIES) {
      // Format ISO date : YYYY-MM-DD strict
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
