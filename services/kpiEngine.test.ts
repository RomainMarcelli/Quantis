import { describe, expect, it } from "vitest";
import { createEmptyMappedFinancialData } from "@/services/mapping/financialDataMapper";
import { computeKpis } from "@/services/kpiEngine";

describe("computeKpis", () => {
  it("computes all mapping KPIs from mapped financial data", () => {
    const mappedData = {
      ...createEmptyMappedFinancialData(),
      total_prod_expl: 584707.14,
      ca_n_minus_1: 500000,
      n: 1,
      achats_march: 143193.59,
      achats_mp: 47731.19,
      ace: 119327.99,
      impots_taxes: 15910.4,
      salaires: 198879.98,
      charges_soc: 83529.59,
      var_stock_march: 7955.2,
      var_stock_mp: 0,
      dap: 39776,
      total_actif_immo: 222745.58,
      total_actif: 453645.24,
      total_stocks: 63641.6,
      creances: 103616.47,
      fournisseurs: 113421.26,
      dettes_fisc_soc: 75614.17,
      clients: 87706.07,
      res_net: -83529.6,
      delta_bfr: 1000,
      dispo: 63641.59,
      emprunts: 189035.43,
      total_cp: 75574.38,
      total_passif: 453645.24,
      total_actif_circ: 230899.66,
      ebit: -79552
    };

    const result = computeKpis(mappedData);

    expect(result.tcam).toBe(16.94);
    expect(result.va).toBe(274454.37);
    expect(result.ebitda).toBe(-23865.6);
    expect(result.marge_ebitda).toBe(-4.08);
    expect(result.point_mort).toBe(669097.87);
    expect(result.bfr).toBe(-21777.36);
    expect(result.dso).toBe(45.62);
    expect(result.dpo).toBe(131.41);
    expect(result.caf).toBe(-43753.6);
    expect(result.tn).toBe(-125393.84);
    expect(result.roe).toBe(-1.11);
    expect(result.roce).toBe(-0.3);
    expect(result.effet_levier).toBe(-0.81);

    expect(result.netProfit).toBe(-83529.6);
    expect(result.workingCapital).toBe(-21777.36);
    expect(result.monthlyBurnRate).toBe(6960.8);
    expect(result.cashRunwayMonths).toBe(9.14);
    expect(result.disponibilites).toBe(63641.59);
    expect(result.ca).toBe(584707.14);
    expect(result.ebe).toBe(-23865.6);
    expect(result.resultat_net).toBe(-83529.6);
    expect(result.capacite_remboursement_annees).toBeNull();
    expect(result.etat_materiel_indice).toBeNull();
  });

  it("returns null for formulas requiring missing inputs", () => {
    const result = computeKpis(createEmptyMappedFinancialData());

    expect(result.tcam).toBeNull();
    expect(result.va).toBeNull();
    expect(result.ebitda).toBeNull();
    expect(result.point_mort).toBeNull();
    expect(result.netProfit).toBeNull();
    expect(result.cashRunwayMonths).toBeNull();
    expect(result.capacite_remboursement_annees).toBeNull();
    expect(result.healthScore).toBeNull();
  });

  it("computes debt repayment capacity when debt and caf are valid", () => {
    const result = computeKpis({
      ...createEmptyMappedFinancialData(),
      emprunts: 100000,
      res_net: 20000,
      dap: 5000
    });

    expect(result.caf).toBe(25000);
    expect(result.capacite_remboursement_annees).toBe(4);
  });

  it("computes immobilization ratio from explicit net and brut fields", () => {
    const result = computeKpis({
      ...createEmptyMappedFinancialData(),
      total_actif_immo_net: 396266.85,
      total_actif_immo_brut: 608223.53
    });

    expect(result.ratio_immo).toBe(0.65);
    expect(result.etat_materiel_indice).toBe(65.15);
  });

  it("does not fallback to total_prod_expl when CA components are present but invalid", () => {
    const result = computeKpis({
      ...createEmptyMappedFinancialData(),
      total_prod_expl: 6_598_806,
      ventes_march: null,
      prod_vendue: -7_105
    });

    expect(result.ca).toBeNull();
  });

  it("returns null healthScore when ca=0 but other signals were extracted (parser failure pattern)", () => {
    // Reproduit le cas SORETOLE post-sanitization : le CA tombe à 0 (revenue
    // non extrait), mais workingCapital reste calculable depuis stocks/dettes.
    // L'ancien comportement renvoyait 100 (workingCapital ≥ 0 → +20/20pts).
    const result = computeKpis({
      ...createEmptyMappedFinancialData(),
      ventes_march: 0,
      prod_vendue: 0,
      total_stocks: 50_000,
      creances: 10_000,
      fournisseurs: 8_000
    });

    expect(result.ca).toBe(0);
    expect(result.workingCapital).not.toBeNull();
    expect(result.healthScore).toBeNull();
  });

  it("preserves null healthScore when no signals at all (legitimate empty input)", () => {
    const result = computeKpis(createEmptyMappedFinancialData());
    expect(result.ca).toBeNull();
    expect(result.healthScore).toBeNull();
  });
});

describe("provision_is — barème IS 2 tranches (article 219 CGI taux PME)", () => {
  it("résultat 30 000 € (sous le seuil 42 500 €) → 30 000 × 15 % = 4 500 €", () => {
    const result = computeKpis({
      ...createEmptyMappedFinancialData(),
      resultat_exercice: 30_000,
    });
    expect(result.provision_is).toBeCloseTo(4_500, 2);
  });

  it("résultat 80 000 € → 42 500 × 15 % + (80 000 − 42 500) × 25 % = 15 750 €", () => {
    // 42 500 × 0.15 = 6 375 ; 37 500 × 0.25 = 9 375 ; total = 15 750
    const result = computeKpis({
      ...createEmptyMappedFinancialData(),
      resultat_exercice: 80_000,
    });
    expect(result.provision_is).toBeCloseTo(15_750, 2);
  });

  it("résultat = seuil exact 42 500 € → 6 375 €", () => {
    const result = computeKpis({
      ...createEmptyMappedFinancialData(),
      resultat_exercice: 42_500,
    });
    expect(result.provision_is).toBeCloseTo(6_375, 2);
  });

  it("résultat ≤ 0 → 0 € (pas d'IS dû)", () => {
    const negative = computeKpis({
      ...createEmptyMappedFinancialData(),
      resultat_exercice: -25_000,
    });
    expect(negative.provision_is).toBe(0);
  });

  it("résultat null → null (pas calculable)", () => {
    const result = computeKpis(createEmptyMappedFinancialData());
    expect(result.provision_is ?? null).toBeNull();
  });

  it("provision_is_mensuelle = provision_is / 12", () => {
    const result = computeKpis({
      ...createEmptyMappedFinancialData(),
      resultat_exercice: 80_000,
    });
    expect(result.provision_is_mensuelle).toBeCloseTo(15_750 / 12, 2);
  });
});
