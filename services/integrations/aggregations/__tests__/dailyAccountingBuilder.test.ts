import { describe, expect, it } from "vitest";
import { buildDailyAccounting } from "@/services/integrations/aggregations/dailyAccountingBuilder";
import type { AccountingEntry, AccountingEntryLine } from "@/types/connectors";

function mkLine(account: string, debit: number, credit: number): AccountingEntryLine {
  return {
    externalId: null,
    accountNumber: account,
    accountLabel: null,
    debit,
    credit,
    currency: "EUR",
    vatRate: null,
    description: null,
    analyticalCodes: [],
    contactExternalId: null,
  };
}

function mkEntry(date: string, lines: AccountingEntryLine[], label = "test"): AccountingEntry {
  return {
    id: `e-${date}-${Math.random()}`,
    userId: "u",
    connectionId: "c",
    externalId: `ext-${date}-${Math.random()}`,
    source: "pennylane",
    providerSub: "pennylane_company",
    syncedAt: new Date().toISOString(),
    rawData: {},
    journalCode: "VE",
    date,
    label,
    reference: null,
    status: "posted",
    totalDebit: lines.reduce((s, l) => s + l.debit, 0),
    totalCredit: lines.reduce((s, l) => s + l.credit, 0),
    currency: "EUR",
    lines,
  };
}

describe("buildDailyAccounting (variable codes 2033-SD)", () => {
  it("produit les variables P&L pour une vente du jour", () => {
    const entries: AccountingEntry[] = [
      mkEntry("2026-03-15", [
        mkLine("411001", 1200, 0),
        mkLine("707000", 0, 1000), // ventes_march
        mkLine("44571", 0, 200),
      ]),
    ];
    const days = buildDailyAccounting(entries);
    expect(days).toHaveLength(1);
    const v = days[0]!.values;
    expect(v.ventes_march).toBe(1000);
    expect(v.total_prod_expl).toBe(1000);
    // Pas d'achats ce jour → 0
    expect(v.achats_march).toBe(0);
    expect(v.salaires).toBe(0);
    // ebit du jour = total_prod_expl - total_charges_expl = 1000 - 0
    expect(v.ebit).toBe(1000);
    // resultat_exercice du jour = ebit + financier + exceptionnel - IS
    expect(v.resultat_exercice).toBe(1000);
  });

  it("produit les variables pour un achat avec TVA", () => {
    const entries: AccountingEntry[] = [
      mkEntry("2026-04-10", [
        mkLine("607001", 700, 0), // achats_march
        mkLine("445661", 140, 0), // TVA déductible (pas dans P&L)
        mkLine("401001", 0, 840),
      ]),
    ];
    const days = buildDailyAccounting(entries);
    expect(days).toHaveLength(1);
    const v = days[0]!.values;
    expect(v.achats_march).toBe(700);
    expect(v.total_charges_expl).toBe(700);
    expect(v.ebit).toBe(-700);
    expect(v.ventes_march).toBe(0);
  });

  it("produit ventes_march + prod_biens + prod_serv → total_prod_expl", () => {
    const entries: AccountingEntry[] = [
      mkEntry("2026-05-01", [
        mkLine("707", 0, 500), // ventes_march = 500
        mkLine("701", 0, 300), // prod_biens = 300
        mkLine("706", 0, 200), // prod_serv = 200
        mkLine("411", 1200, 0),
      ]),
    ];
    const days = buildDailyAccounting(entries);
    const v = days[0]!.values;
    expect(v.ventes_march).toBe(500);
    expect(v.prod_biens).toBe(300);
    expect(v.prod_serv).toBe(200);
    // CA = ventes_march + prod_vendue (= prod_biens + prod_serv)
    expect(v.prod_vendue).toBe(500); // 300 + 200
    expect(v.total_prod_expl).toBe(1000);
  });

  it("agrège plusieurs écritures du même jour", () => {
    const entries: AccountingEntry[] = [
      mkEntry("2026-03-15", [mkLine("411", 1200, 0), mkLine("707", 0, 1000), mkLine("44571", 0, 200)]),
      mkEntry("2026-03-15", [mkLine("411", 600, 0), mkLine("707", 0, 500), mkLine("44571", 0, 100)]),
    ];
    const days = buildDailyAccounting(entries);
    expect(days).toHaveLength(1);
    expect(days[0]!.entryCount).toBe(2);
    expect(days[0]!.values.ventes_march).toBe(1500);
    expect(days[0]!.values.total_prod_expl).toBe(1500);
  });

  it("traite les avoirs comme du CA négatif", () => {
    const entries: AccountingEntry[] = [
      mkEntry("2026-03-01", [mkLine("411", 1200, 0), mkLine("707", 0, 1000), mkLine("4457", 0, 200)]),
      mkEntry("2026-03-15", [mkLine("411", 0, 360), mkLine("707", 300, 0), mkLine("4457", 60, 0)]),
    ];
    const days = buildDailyAccounting(entries);
    expect(days).toHaveLength(2);
    expect(days[0]!.values.ventes_march).toBe(1000);
    // Avoir : credit 0 - debit 300 = -300
    expect(days[1]!.values.ventes_march).toBe(-300);
  });

  it("trie par date croissante et exclut les jours sans écriture", () => {
    const entries: AccountingEntry[] = [
      mkEntry("2026-04-10", [mkLine("607001", 100, 0), mkLine("401001", 0, 100)]),
      mkEntry("2026-01-05", [mkLine("607001", 50, 0), mkLine("401001", 0, 50)]),
      mkEntry("2026-02-20", [mkLine("607001", 75, 0), mkLine("401001", 0, 75)]),
    ];
    const days = buildDailyAccounting(entries);
    expect(days.map((d) => d.date)).toEqual(["2026-01-05", "2026-02-20", "2026-04-10"]);
  });

  it("toutes les 28 variables P&L sont présentes (contrat stable)", () => {
    const entries: AccountingEntry[] = [
      mkEntry("2026-04-01", [mkLine("707", 0, 500), mkLine("411", 500, 0)]),
    ];
    const days = buildDailyAccounting(entries);
    const v = days[0]!.values;
    const expectedKeys = [
      "ventes_march", "prod_biens", "prod_serv", "prod_vendue",
      "prod_stockee", "prod_immo", "subv_expl", "autres_prod_expl",
      "total_prod_expl",
      "achats_march", "var_stock_march", "achats_mp", "var_stock_mp", "ace",
      "impots_taxes", "salaires", "charges_soc", "dap", "dprov",
      "autres_charges_expl", "total_charges_expl",
      "ebit",
      "prod_fin", "charges_fin", "prod_excep", "charges_excep",
      "is_impot", "resultat_exercice",
    ];
    for (const key of expectedKeys) {
      expect(v).toHaveProperty(key);
      expect(typeof v[key as keyof typeof v]).toBe("number");
    }
  });

  it("ne crashe pas avec des entries sans date / lignes pourries", () => {
    const entries: AccountingEntry[] = [
      mkEntry("", [mkLine("707", 0, 100)]),
      mkEntry("2026-04-01", [
        mkLine("", 100, 0),
        mkLine("607", NaN, 0),
        mkLine("607", 50, 0),
        mkLine("401", 0, 50),
      ]),
    ];
    expect(() => buildDailyAccounting(entries)).not.toThrow();
    const days = buildDailyAccounting(entries);
    expect(days).toHaveLength(1);
    expect(days[0]!.values.achats_march).toBe(50);
  });

  it("renvoie un tableau vide pour 0 entries", () => {
    expect(buildDailyAccounting([])).toEqual([]);
  });

  it("salaires + charges_soc séparés (640/641 vs 645)", () => {
    const entries: AccountingEntry[] = [
      mkEntry("2026-04-01", [
        mkLine("641", 3000, 0), // salaires
        mkLine("645", 1500, 0), // charges_soc
        mkLine("421", 0, 3000), // personnel à payer
        mkLine("431", 0, 1500), // sécu sociale à payer
      ]),
    ];
    const days = buildDailyAccounting(entries);
    const v = days[0]!.values;
    expect(v.salaires).toBe(3000);
    expect(v.charges_soc).toBe(1500);
    expect(v.total_charges_expl).toBe(4500);
  });

  // ─── cashBalance : solde cumulé classe 5 fin de jour ─────────────────
  // Régression du 08/05/2026 : le KPI Disponibilités sur /synthese ne
  // réagissait pas à la TemporalityBar parce que `recomputeKpisForPeriod`
  // retournait `mappedData.dispo` (snapshot annuel) au lieu d'un solde
  // dérivé de la période sélectionnée. Le builder doit exposer pour chaque
  // jour le solde cumulé classe 5 ; `recomputeKpisForPeriod` l'utilise.

  describe("cashBalance — solde cumulé classe 5 fin de jour", () => {
    it("cumule les mouvements 5x jour par jour (encaissement client → décaissement fournisseur)", () => {
      const entries: AccountingEntry[] = [
        // Jour 1 : encaissement client 12 000 € sur compte 512
        mkEntry("2026-03-01", [
          mkLine("512000", 12000, 0),
          mkLine("411000", 0, 12000),
        ]),
        // Jour 2 : décaissement fournisseur 4 500 €
        mkEntry("2026-03-15", [
          mkLine("401000", 4500, 0),
          mkLine("512000", 0, 4500),
        ]),
        // Jour 3 : second encaissement 3 200 €
        mkEntry("2026-03-31", [
          mkLine("512000", 3200, 0),
          mkLine("411000", 0, 3200),
        ]),
      ];
      const days = buildDailyAccounting(entries);
      expect(days).toHaveLength(3);
      // Le solde cumulé doit progresser : 12000 → 7500 → 10700
      expect(days[0]!.cashBalance).toBe(12000);
      expect(days[1]!.cashBalance).toBe(7500);
      expect(days[2]!.cashBalance).toBe(10700);
    });

    it("retourne 0 si aucun mouvement classe 5 (cas dégénéré : que des écritures non bancaires)", () => {
      const entries: AccountingEntry[] = [
        mkEntry("2026-04-01", [
          mkLine("641", 3000, 0),
          mkLine("421", 0, 3000),
        ]),
      ];
      const days = buildDailyAccounting(entries);
      expect(days[0]!.cashBalance).toBe(0);
    });

    it("ignore les comptes 519 (concours bancaires courants — passif, pas trésorerie)", () => {
      // Le mapping pcgAggregator classe 519 en shortTermBankDebt (passif),
      // donc 519 ne doit PAS impacter le solde dispo.
      const entries: AccountingEntry[] = [
        mkEntry("2026-05-01", [
          mkLine("512000", 5000, 0), // banque +5000
          mkLine("519100", 0, 5000), // découvert 519 (passif, pas dispo)
        ]),
      ];
      const days = buildDailyAccounting(entries);
      // dispo = 5000 (seul 512), 519 va dans shortTermBankDebt (passif)
      expect(days[0]!.cashBalance).toBe(5000);
    });
  });
});
