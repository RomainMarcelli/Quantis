// File: lib/financials/buildIncomeStatement.test.ts
// Role: tests sur la construction du compte de résultat — vérifie que la
// cascade P&L (produits, charges, résultat exploitation, financier,
// exceptionnel, net) est correctement calculée et que les charges sont
// stockées en valeurs négatives pour pouvoir sommer sans inversion.

import { describe, expect, it } from "vitest";
import { buildIncomeStatement } from "@/lib/financials/buildIncomeStatement";
import type { MappedFinancialData } from "@/types/analysis";

function makeMapped(overrides: Partial<MappedFinancialData> = {}): MappedFinancialData {
  // On part d'un mappedData "tout null" puis on override les champs nécessaires.
  // Toutes les clés sont initialisées à null pour respecter le type.
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

describe("buildIncomeStatement", () => {
  it("calcule produits d'exploitation comme la somme des sous-postes", () => {
    const stmt = buildIncomeStatement(
      makeMapped({
        ventes_march: 500_000,
        prod_vendue: 400_000,
        prod_stockee: 50_000,
        subv_expl: 30_000,
        autres_prod_expl: 20_000,
      }),
      2026
    );
    expect(stmt.produitsExploitation.subtotal).toBe(1_000_000);
  });

  it("stocke les charges en NEGATIF pour permettre une cumul direct", () => {
    const stmt = buildIncomeStatement(
      makeMapped({
        achats_march: 300_000,
        salaires: 180_000,
        charges_soc: 60_000,
      }),
      2026
    );
    // Toutes les lignes de charges doivent être négatives
    for (const l of stmt.chargesExploitation.lines) {
      if (l.value !== null) expect(l.value).toBeLessThanOrEqual(0);
    }
    // Sous-total = somme des négatifs
    expect(stmt.chargesExploitation.subtotal).toBe(-540_000);
  });

  it("résultat d'exploitation = produits + charges (les charges sont déjà en signe négatif)", () => {
    const stmt = buildIncomeStatement(
      makeMapped({
        ventes_march: 500_000,
        prod_vendue: 500_000,
        achats_march: 300_000,
        salaires: 200_000,
      }),
      2026
    );
    // 1 000 000 + (-500 000) = 500 000
    expect(stmt.resultatExploitation).toBe(500_000);
  });

  it("calcule le résultat financier (produits + charges)", () => {
    const stmt = buildIncomeStatement(
      makeMapped({ prod_fin: 5_000, charges_fin: 15_000 }),
      2026
    );
    expect(stmt.resultatFinancier).toBe(-10_000);
  });

  it("calcule le résultat exceptionnel", () => {
    const stmt = buildIncomeStatement(
      makeMapped({ prod_excep: 10_000, charges_excep: 5_000 }),
      2026
    );
    expect(stmt.resultatExceptionnel).toBe(5_000);
  });

  it("résultat avant impôt = exploit + financier + exceptionnel", () => {
    const stmt = buildIncomeStatement(
      makeMapped({
        ventes_march: 1_000_000,
        achats_march: 600_000,
        prod_fin: 5_000,
        charges_fin: 15_000,
        prod_excep: 10_000,
        charges_excep: 5_000,
      }),
      2026
    );
    // exploit = 1 000 000 - 600 000 = 400 000
    // financier = -10 000
    // exceptionnel = 5 000
    expect(stmt.resultatAvantImpot).toBe(395_000);
  });

  it("résultat net : préfère le res_net mappé quand il existe", () => {
    // res_net mappé = 145 000, ne doit PAS être recalculé depuis la cascade
    const stmt = buildIncomeStatement(
      makeMapped({
        ventes_march: 1_000_000,
        achats_march: 600_000,
        is_impot: 50_000,
        res_net: 145_000, // valeur authoritative
      }),
      2026
    );
    expect(stmt.resultatNet).toBe(145_000);
  });

  it("résultat net : fallback sur la cascade si res_net est null", () => {
    const stmt = buildIncomeStatement(
      makeMapped({
        ventes_march: 1_000_000,
        achats_march: 600_000,
        is_impot: 100_000,
      }),
      2026
    );
    // exploit = 400 000, impôt -100 000, net = 300 000
    expect(stmt.resultatNet).toBe(300_000);
  });

  it("retourne null sur les sections vides (pas de mock = tout null)", () => {
    const stmt = buildIncomeStatement(makeMapped(), 2026);
    expect(stmt.produitsExploitation.subtotal).toBeNull();
    expect(stmt.chargesExploitation.subtotal).toBeNull();
    expect(stmt.resultatExploitation).toBeNull();
    expect(stmt.resultatNet).toBeNull();
  });

  it("expose les codes PCG en tooltip pour la traçabilité", () => {
    const stmt = buildIncomeStatement(makeMapped({ ventes_march: 100 }), 2026);
    const ventesLine = stmt.produitsExploitation.lines.find((l) =>
      l.label.includes("Ventes de marchandises")
    );
    expect(ventesLine).toBeDefined();
    expect(ventesLine!.pcgCode).toBe("FL");
  });
});
