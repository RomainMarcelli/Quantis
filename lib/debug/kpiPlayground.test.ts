import { describe, expect, it } from "vitest";
import {
  compareStoredAndRecalculatedKpis,
  getNonNullKpiEntries,
  getNonNullMappedEntries
} from "@/lib/debug/kpiPlayground";
import { createEmptyMappedFinancialData } from "@/services/mapping/financialDataMapper";

describe("kpiPlayground utils", () => {
  it("returns sorted non-null entries for mapped data and kpis", () => {
    const mapped = {
      ...createEmptyMappedFinancialData(),
      salaires: 100,
      achats_mp: 20
    };
    const mappedEntries = getNonNullMappedEntries(mapped);

    expect(mappedEntries).toEqual([
      { key: "achats_mp", value: 20 },
      { key: "salaires", value: 100 }
    ]);

    const kpiEntries = getNonNullKpiEntries({
      tcam: null,
      va: 30,
      ebitda: null,
      marge_ebitda: null,
      charges_var: null,
      mscv: null,
      tmscv: null,
      charges_fixes: null,
      point_mort: null,
      ratio_immo: null,
      bfr: null,
      rot_bfr: null,
      dso: null,
      dpo: null,
      rot_stocks: null,
      caf: null,
      fte: null,
      tn: null,
      solvabilite: null,
      gearing: null,
      liq_gen: null,
      liq_red: null,
      liq_imm: null,
      roce: null,
      roe: null,
      effet_levier: null,
      grossMarginRate: 40,
      netProfit: null,
      workingCapital: null,
      monthlyBurnRate: 0,
      cashRunwayMonths: null,
      healthScore: null
    });

    expect(kpiEntries).toEqual([
      { key: "grossMarginRate", value: 40 },
      { key: "monthlyBurnRate", value: 0 },
      { key: "va", value: 30 }
    ]);
  });

  it("compares stored and recalculated kpis", () => {
    const stored = {
      tcam: null,
      va: 30,
      ebitda: null,
      marge_ebitda: null,
      charges_var: null,
      mscv: null,
      tmscv: null,
      charges_fixes: null,
      point_mort: null,
      ratio_immo: null,
      bfr: null,
      rot_bfr: null,
      dso: null,
      dpo: null,
      rot_stocks: null,
      caf: null,
      fte: null,
      tn: null,
      solvabilite: null,
      gearing: null,
      liq_gen: null,
      liq_red: null,
      liq_imm: null,
      roce: null,
      roe: null,
      effet_levier: null,
      grossMarginRate: 40,
      netProfit: null,
      workingCapital: null,
      monthlyBurnRate: 0,
      cashRunwayMonths: null,
      healthScore: null
    };

    const recalculated = {
      ...stored,
      va: 30.005,
      grossMarginRate: 39.8
    };

    const result = compareStoredAndRecalculatedKpis(stored, recalculated);
    const va = result.find((item) => item.key === "va");
    const margin = result.find((item) => item.key === "grossMarginRate");

    expect(va?.matches).toBe(true);
    expect(margin?.matches).toBe(false);
  });
});
