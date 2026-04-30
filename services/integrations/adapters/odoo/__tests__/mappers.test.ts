// Tests des mappers Odoo (modèles ORM → types internes).
// Format Many2one Odoo : [id, "display_name"] | false. Helpers couvrent ça.

import { describe, expect, it } from "vitest";
import {
  mapJournal,
  mapLedgerAccount,
  mapMove,
  mapPartner,
  mapTrialBalance,
  unpackMany2one,
  type OdooAccount,
  type OdooJournal,
  type OdooMove,
  type OdooMoveLine,
  type OdooMoveLineGroup,
  type OdooPartner,
} from "@/services/integrations/adapters/odoo/mappers";

const CTX = { userId: "user-1", connectionId: "conn-1" };

// ─── unpackMany2one ────────────────────────────────────────────────────────

describe("unpackMany2one", () => {
  it("extrait id + name d'un tuple Odoo", () => {
    expect(unpackMany2one([5, "Sales Journal"])).toEqual({ id: 5, name: "Sales Journal" });
  });

  it("renvoie null pour false (Many2one non renseigné)", () => {
    expect(unpackMany2one(false)).toBeNull();
  });

  it("renvoie null pour undefined ou autres formats invalides", () => {
    expect(unpackMany2one(undefined)).toBeNull();
    expect(unpackMany2one(null)).toBeNull();
    expect(unpackMany2one(42)).toBeNull();
    expect(unpackMany2one("not a tuple")).toBeNull();
    expect(unpackMany2one([])).toBeNull();
  });

  it("convertit les ids en number même si fournis en string", () => {
    expect(unpackMany2one(["7", "Bank"])).toEqual({ id: 7, name: "Bank" });
  });
});

// ─── mapJournal ────────────────────────────────────────────────────────────

describe("mapJournal", () => {
  it("mappe un journal Odoo standard", () => {
    const raw: OdooJournal = {
      id: 5,
      name: "Customer Invoices",
      code: "INV",
      type: "sale",
    };
    const result = mapJournal(raw, CTX);
    expect(result.code).toBe("INV");
    expect(result.label).toBe("Customer Invoices");
    expect(result.type).toBe("sale");
    expect(result.externalId).toBe("5");
    expect(result.source).toBe("odoo");
  });

  it("préserve la valeur native du type Odoo", () => {
    const raw: OdooJournal = { id: 1, name: "Bank", code: "BNK1", type: "bank" };
    expect(mapJournal(raw, CTX).type).toBe("bank");
  });
});

// ─── mapLedgerAccount ──────────────────────────────────────────────────────

describe("mapLedgerAccount", () => {
  it("utilise account_type Odoo en priorité", () => {
    const raw: OdooAccount = {
      id: 100,
      code: "411000",
      name: "Customers",
      account_type: "asset_receivable",
    };
    expect(mapLedgerAccount(raw, CTX).type).toBe("asset");
  });

  it("liability_payable → liability", () => {
    const raw: OdooAccount = {
      id: 200,
      code: "401000",
      name: "Suppliers",
      account_type: "liability_payable",
    };
    expect(mapLedgerAccount(raw, CTX).type).toBe("liability");
  });

  it("income → revenue, expense → expense", () => {
    expect(
      mapLedgerAccount({ id: 1, code: "701000", name: "x", account_type: "income" }, CTX).type
    ).toBe("revenue");
    expect(
      mapLedgerAccount({ id: 2, code: "601000", name: "y", account_type: "expense" }, CTX).type
    ).toBe("expense");
  });

  it("equity_unaffected → equity", () => {
    expect(
      mapLedgerAccount({ id: 1, code: "120000", name: "RAN", account_type: "equity_unaffected" }, CTX)
        .type
    ).toBe("equity");
  });

  it("fallback sur PCG si account_type absent ou inconnu", () => {
    const raw: OdooAccount = { id: 1, code: "411500", name: "x" };
    expect(mapLedgerAccount(raw, CTX).type).toBe("asset");
  });

  it("préserve le code (compatible avec accountPrefix())", () => {
    const result = mapLedgerAccount(
      { id: 1, code: "601000", name: "Achats", account_type: "expense" },
      CTX
    );
    expect(result.number).toBe("601000");
    // dailyAccountingBuilder fait slice(0,3) → "601" ✓
    expect(result.number.slice(0, 3)).toBe("601");
  });

  it("TVA 4456x : préserve le préfixe 4 chars", () => {
    const result = mapLedgerAccount(
      { id: 1, code: "44566", name: "TVA déductible" },
      CTX
    );
    expect(result.number.startsWith("4456")).toBe(true);
  });
});

// ─── mapPartner ────────────────────────────────────────────────────────────

describe("mapPartner", () => {
  it("crée un customer depuis customer_rank>0", () => {
    const raw: OdooPartner = {
      id: 42,
      name: "Acme Corp",
      email: "contact@acme.com",
      vat: "FR12345678901",
      is_company: true,
      customer_rank: 1,
      supplier_rank: 0,
      country_id: [75, "France"],
      industry_id: [3, "Information Technology"],
    };
    const result = mapPartner(raw, CTX);
    expect(result?.type).toBe("customer");
    expect(result?.name).toBe("Acme Corp");
    expect(result?.email).toBe("contact@acme.com");
    expect(result?.vatNumber).toBe("FR12345678901");
    expect(result?.sector).toBe("Information Technology");
    expect(result?.legalName).toBe("Acme Corp"); // is_company=true
  });

  it("crée un supplier depuis supplier_rank>0", () => {
    const raw: OdooPartner = {
      id: 43,
      name: "Big Supplier SAS",
      customer_rank: 0,
      supplier_rank: 5,
      is_company: true,
    };
    const result = mapPartner(raw, CTX);
    expect(result?.type).toBe("supplier");
  });

  it("priorité customer si les deux ranks > 0", () => {
    const raw: OdooPartner = {
      id: 44,
      name: "Partenaire mixte",
      customer_rank: 2,
      supplier_rank: 1,
    };
    expect(mapPartner(raw, CTX)?.type).toBe("customer");
  });

  it("renvoie null si aucun rank > 0 (contact sans rôle commercial)", () => {
    const raw: OdooPartner = { id: 45, name: "Random", customer_rank: 0, supplier_rank: 0 };
    expect(mapPartner(raw, CTX)).toBeNull();
  });

  it("gère les Many2one false (champs vides)", () => {
    const raw: OdooPartner = {
      id: 46,
      name: "X",
      customer_rank: 1,
      country_id: false,
      industry_id: false,
      email: false,
      vat: false,
    };
    const result = mapPartner(raw, CTX);
    expect(result?.email).toBeNull();
    expect(result?.vatNumber).toBeNull();
    expect(result?.sector).toBeNull();
    expect(result?.countryCode).toBeNull();
  });

  it("ne pose pas legalName si is_company=false", () => {
    const raw: OdooPartner = {
      id: 47,
      name: "Personne physique",
      customer_rank: 1,
      is_company: false,
    };
    expect(mapPartner(raw, CTX)?.legalName).toBeNull();
  });
});

// ─── mapMove (le plus important) ───────────────────────────────────────────

describe("mapMove", () => {
  const accountMap = new Map<string, OdooAccount>([
    ["100", { id: 100, code: "601000", name: "Achats matières premières", account_type: "expense" }],
    ["200", { id: 200, code: "401000", name: "Fournisseurs", account_type: "liability_payable" }],
    ["300", { id: 300, code: "44566", name: "TVA déductible" }],
  ]);

  const sampleMove: OdooMove = {
    id: 1500,
    name: "BILL/2026/00012",
    ref: "PO-2026-456",
    date: "2026-04-15",
    journal_id: [3, "PUR Vendor Bills"],
    state: "posted",
    move_type: "in_invoice",
    line_ids: [9001, 9002, 9003],
    currency_id: [1, "EUR"],
  };

  const sampleLines: OdooMoveLine[] = [
    {
      id: 9001,
      move_id: [1500, "BILL/2026/00012"],
      account_id: [100, "601000 Achats matières premières"],
      name: "Achat MP avril",
      debit: 1000,
      credit: 0,
    },
    {
      id: 9002,
      move_id: [1500, "BILL/2026/00012"],
      account_id: [300, "44566 TVA déductible"],
      name: "TVA 20%",
      debit: 200,
      credit: 0,
    },
    {
      id: 9003,
      move_id: [1500, "BILL/2026/00012"],
      account_id: [200, "401000 Fournisseurs"],
      name: "Dette fournisseur",
      debit: 0,
      credit: 1200,
      partner_id: [42, "Big Supplier SAS"],
    },
  ];

  it("résout les codes de compte via la map fournie", () => {
    const result = mapMove(sampleMove, sampleLines, accountMap, CTX);
    expect(result.lines[0]?.accountNumber).toBe("601000");
    expect(result.lines[1]?.accountNumber).toBe("44566");
    expect(result.lines[2]?.accountNumber).toBe("401000");
  });

  it("préserve debit/credit bruts", () => {
    const result = mapMove(sampleMove, sampleLines, accountMap, CTX);
    expect(result.lines[0]).toMatchObject({ debit: 1000, credit: 0 });
    expect(result.lines[2]).toMatchObject({ debit: 0, credit: 1200 });
  });

  it("calcule les totaux équilibrés", () => {
    const result = mapMove(sampleMove, sampleLines, accountMap, CTX);
    expect(result.totalDebit).toBe(1200);
    expect(result.totalCredit).toBe(1200);
  });

  it("status posted → posted", () => {
    expect(mapMove(sampleMove, sampleLines, accountMap, CTX).status).toBe("posted");
  });

  it("status draft/cancel → draft/cancelled", () => {
    expect(mapMove({ ...sampleMove, state: "draft" }, sampleLines, accountMap, CTX).status).toBe(
      "draft"
    );
    expect(mapMove({ ...sampleMove, state: "cancel" }, sampleLines, accountMap, CTX).status).toBe(
      "cancelled"
    );
  });

  it("currency depuis Many2one", () => {
    const result = mapMove(sampleMove, sampleLines, accountMap, CTX);
    expect(result.currency).toBe("EUR");
  });

  it("currency par défaut EUR si Many2one false", () => {
    const move: OdooMove = { ...sampleMove, currency_id: false };
    expect(mapMove(move, sampleLines, accountMap, CTX).currency).toBe("EUR");
  });

  it("propage le contactExternalId depuis partner_id de la ligne", () => {
    const result = mapMove(sampleMove, sampleLines, accountMap, CTX);
    expect(result.lines[2]?.contactExternalId).toBe("42");
    expect(result.lines[0]?.contactExternalId).toBeNull();
  });

  it("fallback : si compte absent de la map, parse le display_name", () => {
    const lineWithUnknownAccount: OdooMoveLine = {
      id: 9999,
      move_id: [1500, "X"],
      account_id: [9999, "999999 Compte exotique"],
      debit: 100,
      credit: 0,
    };
    const result = mapMove(sampleMove, [lineWithUnknownAccount], new Map(), CTX);
    expect(result.lines[0]?.accountNumber).toBe("999999");
    expect(result.lines[0]?.accountLabel).toBe("Compte exotique");
  });

  it("préserve rawData pour debug", () => {
    const result = mapMove(sampleMove, sampleLines, accountMap, CTX);
    expect((result.rawData as { id: number }).id).toBe(1500);
  });

  it("ne crashe pas avec des lines vides", () => {
    expect(() => mapMove(sampleMove, [], accountMap, CTX)).not.toThrow();
    const result = mapMove(sampleMove, [], accountMap, CTX);
    expect(result.lines).toHaveLength(0);
    expect(result.totalDebit).toBe(0);
  });
});

// ─── mapTrialBalance ───────────────────────────────────────────────────────

describe("mapTrialBalance", () => {
  it("agrège des read_group Odoo en NormalizedTrialBalanceEntry", () => {
    const accountMap = new Map<string, OdooAccount>([
      ["100", { id: 100, code: "411000", name: "Clients" }],
      ["200", { id: 200, code: "401000", name: "Fournisseurs" }],
    ]);
    const groups: OdooMoveLineGroup[] = [
      { account_id: [100, "411000 Clients"], "debit:sum": 12000, "credit:sum": 3000 },
      { account_id: [200, "401000 Fournisseurs"], "debit:sum": 1000, "credit:sum": 8000 },
    ];
    const result = mapTrialBalance(
      groups,
      accountMap,
      new Date("2026-01-01"),
      new Date("2026-12-31")
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      accountNumber: "411000",
      accountLabel: "Clients",
      debit: 12000,
      credit: 3000,
    });
    expect(result[1]).toMatchObject({
      accountNumber: "401000",
      debit: 1000,
      credit: 8000,
    });
  });

  it("filtre les groupes dont le compte est inconnu", () => {
    const accountMap = new Map<string, OdooAccount>([
      ["100", { id: 100, code: "411000", name: "Clients" }],
    ]);
    const groups: OdooMoveLineGroup[] = [
      { account_id: [100, "411000 Clients"], "debit:sum": 1000, "credit:sum": 0 },
      { account_id: [999, "999000 Inconnu"], "debit:sum": 500, "credit:sum": 0 },
    ];
    const result = mapTrialBalance(groups, accountMap, new Date(), new Date());
    expect(result).toHaveLength(1);
    expect(result[0]?.accountNumber).toBe("411000");
  });

  it("filtre les groupes sans Many2one valide (account_id false)", () => {
    const accountMap = new Map<string, OdooAccount>();
    const groups: OdooMoveLineGroup[] = [
      { account_id: false as never, "debit:sum": 100, "credit:sum": 0 },
    ];
    expect(() => mapTrialBalance(groups, accountMap, new Date(), new Date())).not.toThrow();
    expect(mapTrialBalance(groups, accountMap, new Date(), new Date())).toHaveLength(0);
  });

  it("propage les dates de période en ISO", () => {
    const accountMap = new Map<string, OdooAccount>([
      ["1", { id: 1, code: "411", name: "x" }],
    ]);
    const groups: OdooMoveLineGroup[] = [
      { account_id: [1, "411 x"], "debit:sum": 100, "credit:sum": 0 },
    ];
    const result = mapTrialBalance(
      groups,
      accountMap,
      new Date("2026-01-01T00:00:00Z"),
      new Date("2026-12-31T23:59:59Z")
    );
    expect(result[0]?.periodStart).toBe("2026-01-01T00:00:00.000Z");
    expect(result[0]?.periodEnd).toBe("2026-12-31T23:59:59.000Z");
  });

  it("ne crashe pas sur tableau vide", () => {
    expect(() => mapTrialBalance([], new Map(), new Date(), new Date())).not.toThrow();
  });

  it("missing debit:sum / credit:sum → 0", () => {
    const accountMap = new Map<string, OdooAccount>([
      ["1", { id: 1, code: "411", name: "x" }],
    ]);
    const groups: OdooMoveLineGroup[] = [{ account_id: [1, "411 x"] }];
    const result = mapTrialBalance(groups, accountMap, new Date(), new Date());
    expect(result[0]).toMatchObject({ debit: 0, credit: 0 });
  });
});
