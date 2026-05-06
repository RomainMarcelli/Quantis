import { describe, expect, it } from "vitest";
import { buildBalanceSheetSnapshot } from "@/services/integrations/aggregations/balanceSheetSnapshotBuilder";
import type { NormalizedTrialBalanceEntry } from "@/types/connectors";

function tb(account: string, debit: number, credit: number): NormalizedTrialBalanceEntry {
  return {
    accountNumber: account,
    accountLabel: "",
    formattedNumber: null,
    debit,
    credit,
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
  };
}

describe("buildBalanceSheetSnapshot (variable codes 2033-SD)", () => {
  it("produit les variables bilan classiques depuis une trial balance", () => {
    const trialBalance: NormalizedTrialBalanceEntry[] = [
      tb("101", 0, 50000),     // capital
      tb("164", 0, 30000),     // emprunts
      tb("411", 8000, 0),      // clients
      tb("401", 0, 4800),      // fournisseurs
      tb("44571", 0, 2000),    // TVA collectée → dettes_fisc_soc
      tb("44566", 800, 0),     // TVA déductible → dettes_fisc_soc (négatif)
      tb("512", 60000, 0),     // banque → dispo
      tb("21", 5000, 0),       // immo corporelles → immob_corp
    ];
    const snap = buildBalanceSheetSnapshot(trialBalance, "2026-04-30", "2026-01-01");

    expect(snap.asOfDate).toBe("2026-04-30");
    expect(snap.periodStart).toBe("2026-01-01");

    expect(snap.values.capital).toBe(50000);
    expect(snap.values.emprunts).toBe(30000);
    expect(snap.values.clients).toBe(8000);
    expect(snap.values.fournisseurs).toBe(4800);
    expect(snap.values.dispo).toBe(60000);
    expect(snap.values.immob_corp).toBe(5000);
  });

  it("toutes les variables bilan sont présentes (contrat stable)", () => {
    const trialBalance: NormalizedTrialBalanceEntry[] = [
      tb("101", 0, 1000),
    ];
    const snap = buildBalanceSheetSnapshot(trialBalance, "2026-04-30", "2026-01-01");
    const expectedKeys = [
      "immob_incorp", "immob_corp", "immob_fin", "total_actif_immo",
      "stocks_mp", "stocks_march", "total_stocks",
      "avances_vers_actif",
      "clients", "autres_creances", "creances",
      "vmp", "dispo", "cca",
      "total_actif_circ", "total_actif",
      "capital", "ecarts_reeval", "reserve_legale", "reserves_reglem",
      "autres_reserves", "ran", "res_net", "subv_invest", "prov_reglem",
      "total_cp", "total_prov",
      "emprunts", "avances_recues_passif", "fournisseurs",
      "dettes_fisc_soc", "cca_passif", "autres_dettes", "pca",
      "total_dettes", "total_passif",
    ];
    for (const key of expectedKeys) {
      expect(snap.values).toHaveProperty(key);
      expect(typeof snap.values[key as keyof typeof snap.values]).toBe("number");
    }
  });

  it("calcule total_cp = capital + résultat (via le bridge)", () => {
    const trialBalance: NormalizedTrialBalanceEntry[] = [
      tb("101", 0, 100000),  // capital
      tb("701", 0, 50000),   // ventes (P&L)
      tb("607", 30000, 0),   // achats (P&L)
      tb("411", 60000, 0),   // clients
      tb("401", 0, 36000),   // fournisseurs
      tb("44571", 0, 10000),
      tb("44566", 6000, 0),
      tb("512", 80000, 0),
    ];
    const snap = buildBalanceSheetSnapshot(trialBalance, "2026-04-30", "2026-01-01");
    // resultat de l'exercice = 50000 - 30000 = 20000 → injecté dans equity
    // total_cp = capital + résultat = 100000 + 20000 = 120000
    expect(snap.values.capital).toBe(100000);
    expect(snap.values.total_cp).toBe(120000);
  });

  it("ne crashe pas avec données pourries (compte vide, NaN, comptes hors PCG)", () => {
    const trialBalance: NormalizedTrialBalanceEntry[] = [
      tb("", 100, 0),
      tb("411", NaN, 0),
      tb("411", 0, NaN),
      tb("411", 1000, 0),
      tb("999", 5000, 0), // hors PCG
      tb("ABC", 200, 0),
    ];
    expect(() => buildBalanceSheetSnapshot(trialBalance, "2026-04-30", "2026-01-01")).not.toThrow();
    const snap = buildBalanceSheetSnapshot(trialBalance, "2026-04-30", "2026-01-01");
    expect(snap.values.clients).toBe(1000);
    // Les codes inconnus sont absents : la liste est figée.
    expect(snap.values).not.toHaveProperty("999");
  });

  it("trial balance vide → toutes les variables à 0", () => {
    const snap = buildBalanceSheetSnapshot([], "2026-04-30", "2026-01-01");
    expect(snap.values.capital).toBe(0);
    expect(snap.values.clients).toBe(0);
    expect(snap.values.fournisseurs).toBe(0);
    expect(snap.values.total_passif).toBe(0);
  });
});
