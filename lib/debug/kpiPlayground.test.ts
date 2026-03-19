import { describe, expect, it } from "vitest";
import {
  getNonNullKpiEntries,
  getNonNullMappedEntries,
  getPlaygroundDefaultInput,
  parseMappedDataJson
} from "@/lib/debug/kpiPlayground";

describe("kpiPlayground utils", () => {
  it("parses valid mapped data json and keeps known numeric keys", () => {
    const result = parseMappedDataJson(
      JSON.stringify({
        total_prod_expl: 1200,
        inconnue: 99,
        salaires: "100"
      })
    );

    expect(result.success).toBe(true);
    expect(result.data.total_prod_expl).toBe(1200);
    expect(result.data.salaires).toBeNull();
  });

  it("returns a readable error on invalid json", () => {
    const result = parseMappedDataJson("{");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("JSON invalide");
    }
  });

  it("returns sorted non-null entries for mapped data and kpis", () => {
    const mapped = parseMappedDataJson(JSON.stringify({ salaires: 100, achats_mp: 20 })).data;
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

  it("provides a non-empty default playground json", () => {
    const text = getPlaygroundDefaultInput();
    expect(text).toContain("total_prod_expl");
    expect(text.length).toBeGreaterThan(100);
  });
});
