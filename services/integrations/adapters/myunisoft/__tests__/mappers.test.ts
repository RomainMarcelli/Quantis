// Tests des mappers MyUnisoft (format MAD → types internes).
// Fixtures basées sur les exemples officiels de la doc :
// https://github.com/MyUnisoft/api-partenaires/tree/main/docs/MAD/specs/v1.0.0

import { describe, expect, it } from "vitest";
import {
  mapContactFromAccount,
  mapEntry,
  mapJournal,
  mapLedgerAccount,
  mapTrialBalance,
  type MyUnisoftAccount,
  type MyUnisoftBalanceEntry,
  type MyUnisoftEntry,
  type MyUnisoftJournal,
} from "@/services/integrations/adapters/myunisoft/mappers";

const CTX = { userId: "user-1", connectionId: "conn-1" };

// ─── mapJournal ────────────────────────────────────────────────────────────

describe("mapJournal", () => {
  it("mappe un journal Achat", () => {
    const raw: MyUnisoftJournal = {
      producerId: "137145",
      customerReferenceCode: "AC",
      name: "ACHATS",
      type: "Achat",
      counterpartAccount: null,
      additionalProducerProperties: { type: "ACH", locked: false },
    };
    const result = mapJournal(raw, CTX);
    expect(result.code).toBe("AC");
    expect(result.label).toBe("ACHATS");
    expect(result.type).toBe("Achat");
    expect(result.externalId).toBe("137145");
    expect(result.source).toBe("myunisoft");
  });

  it("préserve la valeur native du type même si non standard", () => {
    const raw: MyUnisoftJournal = {
      producerId: "1",
      type: "OD Extracomptable",
    };
    const result = mapJournal(raw, CTX);
    expect(result.type).toBe("OD Extracomptable");
  });

  it("fallback sur additionalProducerProperties.type si pas de customerReferenceCode", () => {
    const raw: MyUnisoftJournal = {
      producerId: "36504",
      name: "ECRITURES D'INVENTAIRE",
      additionalProducerProperties: { type: "OD_EXC" },
    };
    const result = mapJournal(raw, CTX);
    expect(result.code).toBe("OD_EXC");
  });
});

// ─── mapLedgerAccount ──────────────────────────────────────────────────────

describe("mapLedgerAccount", () => {
  it("classe les comptes 60x → expense", () => {
    const raw: MyUnisoftAccount = {
      producerId: "1482937",
      number: "6010000000",
      name: "ACHATS MATIERES PREM",
    };
    const result = mapLedgerAccount(raw, CTX);
    expect(result.number).toBe("6010000000");
    expect(result.type).toBe("expense");
  });

  it("classe les comptes 411x → asset (clients)", () => {
    const raw: MyUnisoftAccount = {
      producerId: "990",
      number: "4110000001",
      name: "Client A",
    };
    expect(mapLedgerAccount(raw, CTX).type).toBe("asset");
  });

  it("classe les comptes 401x/404x → liability (fournisseurs)", () => {
    expect(
      mapLedgerAccount({ producerId: "1", number: "4011700000", name: "F1" }, CTX).type
    ).toBe("liability");
    expect(
      mapLedgerAccount({ producerId: "2", number: "4040000000", name: "F2" }, CTX).type
    ).toBe("liability");
  });

  it("classe 44x (TVA, dettes fiscales) → liability", () => {
    expect(
      mapLedgerAceTypeFor("4456000000")
    ).toBe("liability");
    expect(
      mapLedgerAceTypeFor("4457100000")
    ).toBe("liability");
  });

  it("classe 5x → asset (trésorerie)", () => {
    expect(mapLedgerAceTypeFor("5120000000")).toBe("asset");
    expect(mapLedgerAceTypeFor("5300000000")).toBe("asset");
  });

  it("classe 1x → equity (capitaux)", () => {
    expect(mapLedgerAceTypeFor("1010000000")).toBe("equity");
    expect(mapLedgerAceTypeFor("1640000000")).toBe("equity");
  });

  it("classe 7x → revenue (produits)", () => {
    expect(mapLedgerAceTypeFor("7010000000")).toBe("revenue");
    expect(mapLedgerAceTypeFor("7060000000")).toBe("revenue");
  });

  it("préserve le numéro de compte 10 chars (compatible avec accountPrefix())", () => {
    const result = mapLedgerAccount(
      { producerId: "1", number: "6010000000", name: "x" },
      CTX
    );
    // Le builder dailyAccountingBuilder fait .slice(0, 3) → "601" ✓
    expect(result.number.slice(0, 3)).toBe("601");
    // Pour TVA 4456 → preserved
    const tva = mapLedgerAccount({ producerId: "2", number: "4456000000", name: "x" }, CTX);
    expect(tva.number.startsWith("4456")).toBe(true);
  });
});

function mapLedgerAceTypeFor(number: string) {
  return mapLedgerAccount({ producerId: "x", number, name: "x" }, CTX).type;
}

// ─── mapContactFromAccount ─────────────────────────────────────────────────

describe("mapContactFromAccount", () => {
  it("crée un contact customer pour un compte 411x avec company", () => {
    const raw: MyUnisoftAccount = {
      producerId: "990",
      number: "4110000001",
      name: "MYUNISOFT",
      company: {
        name: "MYUNISOFT",
        SIREN: "840143275",
        address: { country: "FRANCE", city: "Paris" },
        contacts: [{ email: "contact@myunisoft.fr", firstname: "Régis", lastname: "Samuel" }],
        ape: { code: "5829C", name: "Édition de logiciels applicatifs" },
      },
    };
    const result = mapContactFromAccount(raw, CTX);
    expect(result).not.toBeNull();
    expect(result?.type).toBe("customer");
    expect(result?.name).toBe("MYUNISOFT");
    expect(result?.siret).toBe("840143275");
    expect(result?.email).toBe("contact@myunisoft.fr");
    expect(result?.sector).toBe("Édition de logiciels applicatifs");
  });

  it("crée un contact supplier pour un compte 401x", () => {
    const raw: MyUnisoftAccount = {
      producerId: "55",
      number: "4011700000",
      name: "Fournisseur X",
      company: { name: "Fournisseur X", SIREN: "111222333" },
    };
    const result = mapContactFromAccount(raw, CTX);
    expect(result?.type).toBe("supplier");
    expect(result?.siret).toBe("111222333");
  });

  it("retourne null pour un compte sans company (compte standard non auxiliarisé)", () => {
    const raw: MyUnisoftAccount = {
      producerId: "1",
      number: "6010000000",
      name: "Achats",
    };
    expect(mapContactFromAccount(raw, CTX)).toBeNull();
  });

  it("retourne null pour un compte avec company mais hors racine 40x/41x", () => {
    const raw: MyUnisoftAccount = {
      producerId: "1",
      number: "5120000000",
      name: "Banque",
      company: { name: "BNP" },
    };
    expect(mapContactFromAccount(raw, CTX)).toBeNull();
  });
});

// ─── mapEntry (cœur du mapper, le plus important) ──────────────────────────

describe("mapEntry", () => {
  const sampleEntry: MyUnisoftEntry = {
    producerId: "13524346",
    date: "2023-02-01",
    dueDate: null,
    journal: {
      producerId: "137145",
      customerReferenceCode: "AC",
      name: "ACHATS",
      type: "Achat",
    },
    currency: { code: "EUR" },
    movements: [
      {
        producerId: "43221797",
        description: "Achat MP",
        value: { credit: 1200, debit: 0, amount: 1200 },
        account: { producerId: "1482937", number: "6010000000", name: "ACHATS MATIERES PREM" },
      },
      {
        producerId: "43221798",
        description: "Achat MP",
        value: { credit: 0, debit: 1200, amount: -1200 },
        account: { producerId: "2567407", number: "4011700000", name: "Fournisseur X" },
      },
    ],
    additionalProducerProperties: { createdAt: 1709852400, accountedAt: "2023-01-20" },
  };

  it("préserve les numéros de compte 10 chars (essentiel pour accountPrefix)", () => {
    const result = mapEntry(sampleEntry, CTX);
    expect(result.lines[0]?.accountNumber).toBe("6010000000");
    expect(result.lines[1]?.accountNumber).toBe("4011700000");
    // Vérifie que slice(0,3) des préfixes donne ce qu'on attend (= comportement
    // du dailyAccountingBuilder).
    expect(result.lines[0]?.accountNumber.slice(0, 3)).toBe("601");
    expect(result.lines[1]?.accountNumber.slice(0, 3)).toBe("401");
  });

  it("conserve debit/credit bruts (pas de signed amount)", () => {
    const result = mapEntry(sampleEntry, CTX);
    expect(result.lines[0]).toMatchObject({ credit: 1200, debit: 0 });
    expect(result.lines[1]).toMatchObject({ credit: 0, debit: 1200 });
  });

  it("calcule totalDebit et totalCredit (équilibre)", () => {
    const result = mapEntry(sampleEntry, CTX);
    expect(result.totalDebit).toBe(1200);
    expect(result.totalCredit).toBe(1200);
  });

  it("propage la date au format ISO", () => {
    const result = mapEntry(sampleEntry, CTX);
    expect(result.date).toBe("2023-02-01T00:00:00.000Z");
  });

  it("utilise customerReferenceCode comme journalCode", () => {
    const result = mapEntry(sampleEntry, CTX);
    expect(result.journalCode).toBe("AC");
  });

  it("status = posted par défaut", () => {
    const result = mapEntry(sampleEntry, CTX);
    expect(result.status).toBe("posted");
  });

  it("source = myunisoft, providerSub = null", () => {
    const result = mapEntry(sampleEntry, CTX);
    expect(result.source).toBe("myunisoft");
    expect(result.providerSub).toBeNull();
  });

  it("ne crashe pas avec movements vide", () => {
    const empty: MyUnisoftEntry = {
      ...sampleEntry,
      movements: [],
    };
    expect(() => mapEntry(empty, CTX)).not.toThrow();
    const result = mapEntry(empty, CTX);
    expect(result.lines).toHaveLength(0);
    expect(result.totalDebit).toBe(0);
  });

  it("currency par défaut EUR si non spécifiée", () => {
    const noCurrency: MyUnisoftEntry = { ...sampleEntry, currency: undefined };
    expect(mapEntry(noCurrency, CTX).currency).toBe("EUR");
  });

  it("préserve le rawData pour debug et migration", () => {
    const result = mapEntry(sampleEntry, CTX);
    expect(result.rawData).toBeDefined();
    expect((result.rawData as { producerId: string }).producerId).toBe("13524346");
  });
});

// ─── mapTrialBalance ───────────────────────────────────────────────────────

describe("mapTrialBalance", () => {
  it("convertit balance signée en debit/credit (compatible trialBalanceAggregator)", () => {
    const raw: MyUnisoftBalanceEntry[] = [
      { account: { number: "1290000000", name: "RESULTAT EX. PERTES" }, balance: 6260482.6 },
      { account: { number: "1310000000", name: "SUBVENTIONS D EQUIPEMENT" }, balance: -10000 },
    ];
    const result = mapTrialBalance(raw, new Date("2025-01-01"), new Date("2025-12-31"));

    // Balance positive → debit, credit = 0
    expect(result[0]).toMatchObject({
      accountNumber: "1290000000",
      debit: 6260482.6,
      credit: 0,
    });
    // Balance négative → credit = -balance, debit = 0
    expect(result[1]).toMatchObject({
      accountNumber: "1310000000",
      debit: 0,
      credit: 10000,
    });
  });

  it("préserve la sémantique balance = debit - credit", () => {
    const raw: MyUnisoftBalanceEntry[] = [
      { account: { number: "411", name: "Clients" }, balance: 8000 },
      { account: { number: "401", name: "Fournisseurs" }, balance: -3000 },
    ];
    const result = mapTrialBalance(raw, new Date("2025-01-01"), new Date("2025-12-31"));
    expect(result[0]!.debit - result[0]!.credit).toBe(8000);
    expect(result[1]!.debit - result[1]!.credit).toBe(-3000);
  });

  it("filtre les entrées sans numéro de compte", () => {
    const raw: MyUnisoftBalanceEntry[] = [
      { account: { number: "411", name: "Clients" }, balance: 1000 },
      { account: { number: "", name: "Vide" }, balance: 500 },
    ];
    const result = mapTrialBalance(raw, new Date("2025-01-01"), new Date("2025-12-31"));
    expect(result).toHaveLength(1);
    expect(result[0]!.accountNumber).toBe("411");
  });

  it("ne crashe pas avec un tableau vide", () => {
    expect(() => mapTrialBalance([], new Date(), new Date())).not.toThrow();
  });

  it("propage les dates de période en ISO", () => {
    const raw: MyUnisoftBalanceEntry[] = [
      { account: { number: "411", name: "x" }, balance: 100 },
    ];
    const result = mapTrialBalance(
      raw,
      new Date("2025-01-01T00:00:00Z"),
      new Date("2025-12-31T23:59:59Z")
    );
    expect(result[0]!.periodStart).toBe("2025-01-01T00:00:00.000Z");
    expect(result[0]!.periodEnd).toBe("2025-12-31T23:59:59.000Z");
  });
});
