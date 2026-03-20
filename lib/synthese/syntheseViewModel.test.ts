// File: lib/synthese/syntheseViewModel.test.ts
// Role: tests unitaires de la logique de synthese (tendances, alertes, actions) sans dependance UI.
import { describe, expect, it } from "vitest";
import type { CalculatedKpis } from "@/types/analysis";
import { buildSyntheseViewModel, buildTrend } from "@/lib/synthese/syntheseViewModel";

function makeKpis(partial: Partial<CalculatedKpis>): CalculatedKpis {
  return {
    tcam: null,
    va: null,
    ebitda: null,
    ebe: null,
    marge_ebitda: null,
    charges_var: null,
    mscv: null,
    tmscv: null,
    ca: null,
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
    disponibilites: null,
    roce: null,
    roe: null,
    effet_levier: null,
    resultat_net: null,
    grossMarginRate: null,
    netProfit: null,
    workingCapital: null,
    monthlyBurnRate: null,
    cashRunwayMonths: null,
    capacite_remboursement_annees: null,
    etat_materiel_indice: null,
    healthScore: null,
    ...partial
  };
}

describe("buildTrend", () => {
  it("retourne une tendance haussiere", () => {
    const trend = buildTrend(120, 100);
    expect(trend.direction).toBe("up");
    expect(trend.tone).toBe("positive");
    expect(trend.label).toContain("+");
  });

  it("retourne une tendance baissiere", () => {
    const trend = buildTrend(80, 100);
    expect(trend.direction).toBe("down");
    expect(trend.tone).toBe("negative");
    expect(trend.label).toContain("-");
  });

  it("retourne N/D si la periode precedente est absente", () => {
    const trend = buildTrend(80, null);
    expect(trend.direction).toBe("na");
    expect(trend.label).toBe("N/D");
  });
});

describe("buildSyntheseViewModel", () => {
  it("construit les 3 KPI principaux attendus", () => {
    const vm = buildSyntheseViewModel(
      makeKpis({
        ca: 120000,
        ebe: 24000,
        disponibilites: 19000,
        healthScore: 72
      }),
      makeKpis({
        ca: 100000,
        ebe: 22000,
        disponibilites: 20000
      })
    );

    expect(vm.metrics).toHaveLength(3);
    expect(vm.metrics.map((metric) => metric.id)).toEqual(["ca", "ebe", "cash"]);
    expect(vm.scoreLabel).toBe("Santé globale solide");
  });

  it("genere des alertes metier si score/cash/bfr sont critiques", () => {
    const vm = buildSyntheseViewModel(
      makeKpis({
        healthScore: 40,
        disponibilites: -1200,
        bfr: 180000,
        ebe: -800
      })
    );

    expect(vm.alerts.length).toBeGreaterThanOrEqual(3);
    expect(vm.actions.length).toBeGreaterThan(0);
  });
});
