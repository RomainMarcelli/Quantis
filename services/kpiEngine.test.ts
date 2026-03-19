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
  });

  it("returns null for formulas requiring missing inputs", () => {
    const result = computeKpis(createEmptyMappedFinancialData());

    expect(result.tcam).toBeNull();
    expect(result.va).toBeNull();
    expect(result.ebitda).toBeNull();
    expect(result.point_mort).toBeNull();
    expect(result.netProfit).toBeNull();
    expect(result.cashRunwayMonths).toBeNull();
    expect(result.healthScore).toBeNull();
  });
});
