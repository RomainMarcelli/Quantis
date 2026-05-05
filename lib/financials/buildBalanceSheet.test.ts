// File: lib/financials/buildBalanceSheet.test.ts
// Role: tests sur la construction du bilan — vérifie l'équilibre
// actif/passif et le calcul des sous-totaux par section.

import { describe, expect, it } from "vitest";
import { buildBalanceSheet } from "@/lib/financials/buildBalanceSheet";
import type { MappedFinancialData } from "@/types/analysis";

function makeMapped(overrides: Partial<MappedFinancialData> = {}): MappedFinancialData {
  const allKeys = [
    "immob_incorp", "immob_corp", "immob_fin", "total_actif_immo",
    "total_actif_immo_brut", "total_actif_immo_net", "stocks_mp",
    "stocks_march", "total_stocks", "avances_vers_actif", "clients",
    "autres_creances", "creances", "vmp", "dispo", "cca",
    "total_actif_circ", "total_actif", "capital", "ecarts_reeval",
    "reserve_legale", "reserves_reglem", "autres_reserves", "ran",
    "res_net", "subv_invest", "prov_reglem", "total_cp", "total_prov",
    "emprunts", "avances_recues_passif", "fournisseurs",
    "dettes_fisc_soc", "cca_passif", "autres_dettes", "pca",
    "total_dettes", "total_passif", "ventes_march", "prod_biens",
    "prod_serv", "prod_vendue", "prod_stockee", "prod_immo",
    "subv_expl", "autres_prod_expl", "total_prod_expl", "achats_march",
    "var_stock_march", "achats_mp", "var_stock_mp", "ace",
    "impots_taxes", "salaires", "charges_soc", "dap", "dprov",
    "autres_charges_expl", "total_charges_expl", "ebit", "prod_fin",
    "charges_fin", "prod_excep", "charges_excep", "is_impot",
    "resultat_exercice", "ca_n_minus_1", "n", "delta_bfr",
  ];
  const empty = Object.fromEntries(allKeys.map((k) => [k, null])) as MappedFinancialData;
  return { ...empty, ...overrides };
}

describe("buildBalanceSheet", () => {
  it("calcule le total actif = immo + circulant + cca", () => {
    const sheet = buildBalanceSheet(
      makeMapped({
        immob_incorp: 50_000,
        immob_corp: 350_000,
        immob_fin: 100_000,
        total_stocks: 200_000,
        clients: 400_000,
        autres_creances: 50_000,
        vmp: 50_000,
        dispo: 100_000,
        cca: 0,
      }),
      2026
    );
    // immo = 500 000 ; circ = 800 000 ; cca = 0
    expect(sheet.actif.immobilise.subtotal).toBe(500_000);
    expect(sheet.actif.circulant.subtotal).toBe(800_000);
    expect(sheet.actif.total).toBe(1_300_000);
  });

  it("calcule le total passif = capitaux + provisions + dettes + pca", () => {
    const sheet = buildBalanceSheet(
      makeMapped({
        capital: 100_000,
        reserve_legale: 50_000,
        ran: 30_000,
        res_net: 145_000,
        total_prov: 20_000,
        emprunts: 500_000,
        fournisseurs: 300_000,
        dettes_fisc_soc: 150_000,
        autres_dettes: 5_000,
      }),
      2026
    );
    // CP = 100 + 50 + 30 + 145 = 325
    // Prov = 20
    // Dettes = 500 + 300 + 150 + 5 = 955
    // Total = 1 300 (en milliers)
    expect(sheet.passif.capitauxPropres.subtotal).toBe(325_000);
    expect(sheet.passif.provisions.subtotal).toBe(20_000);
    expect(sheet.passif.dettes.subtotal).toBe(955_000);
    expect(sheet.passif.total).toBe(1_300_000);
  });

  it("affiche un bilan équilibré (Total actif = Total passif) sur un cas réaliste", () => {
    const sheet = buildBalanceSheet(
      makeMapped({
        // ACTIF = 1 300 000
        immob_incorp: 50_000, immob_corp: 350_000, immob_fin: 100_000,
        total_stocks: 200_000, clients: 400_000, autres_creances: 50_000,
        vmp: 50_000, dispo: 100_000, cca: 0,
        // PASSIF = 1 300 000
        capital: 100_000, reserve_legale: 50_000, ran: 30_000,
        res_net: 145_000, total_prov: 20_000, emprunts: 500_000,
        fournisseurs: 300_000, dettes_fisc_soc: 150_000, autres_dettes: 5_000,
      }),
      2026
    );
    expect(sheet.actif.total).toBe(sheet.passif.total);
  });

  it("préfère res_net sur resultat_exercice pour la ligne 'Résultat de l'exercice'", () => {
    const sheet = buildBalanceSheet(
      makeMapped({ res_net: 100, resultat_exercice: 200 }),
      2026
    );
    const resLine = sheet.passif.capitauxPropres.lines.find((l) =>
      l.label.includes("Résultat de l'exercice")
    );
    expect(resLine?.value).toBe(100);
  });

  it("retombe sur resultat_exercice si res_net est null", () => {
    const sheet = buildBalanceSheet(
      makeMapped({ res_net: null, resultat_exercice: 200 }),
      2026
    );
    const resLine = sheet.passif.capitauxPropres.lines.find((l) =>
      l.label.includes("Résultat de l'exercice")
    );
    expect(resLine?.value).toBe(200);
  });

  it("retourne null sur tous les totaux si aucune donnée", () => {
    const sheet = buildBalanceSheet(makeMapped(), 2026);
    expect(sheet.actif.total).toBeNull();
    expect(sheet.passif.total).toBeNull();
  });
});
