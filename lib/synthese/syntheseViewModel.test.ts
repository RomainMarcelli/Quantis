// File: lib/synthese/syntheseViewModel.test.ts
// Role: tests unitaires de la logique de synthèse (tendances, score Quantis, alertes, actions) sans dépendance UI.
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
  it("retourne une tendance haussière", () => {
    const trend = buildTrend(120, 100);
    expect(trend.direction).toBe("up");
    expect(trend.tone).toBe("positive");
    expect(trend.label).toContain("+");
  });

  it("retourne une tendance baissière", () => {
    const trend = buildTrend(80, 100);
    expect(trend.direction).toBe("down");
    expect(trend.tone).toBe("negative");
    expect(trend.label).toContain("-");
  });

  it("retourne N/D si la période précédente est absente", () => {
    const trend = buildTrend(80, null);
    expect(trend.direction).toBe("na");
    expect(trend.label).toBe("N/D");
  });
});

describe("buildSyntheseViewModel", () => {
  it("construit les 3 KPI principaux et expose les piliers du score", () => {
    const vm = buildSyntheseViewModel(
      makeKpis({
        ca: 300000,
        ebe: 70000,
        disponibilites: 60000,
        grossMarginRate: 52,
        marge_ebitda: 24,
        resultat_net: 40000,
        roce: 0.18,
        roe: 0.22,
        rot_bfr: 60,
        tcam: 12,
        point_mort: 150000,
        fte: 15000,
        solvabilite: 0.4,
        gearing: 0.8,
        liq_gen: 1.6,
        liq_red: 1.2,
        liq_imm: 0.9,
        tn: 45000,
        ratio_immo: 0.55
      }),
      makeKpis({
        ca: 250000,
        ebe: 63000,
        disponibilites: 55000
      })
    );

    expect(vm.metrics).toHaveLength(3);
    expect(vm.metrics.map((metric) => metric.id)).toEqual(["ca", "ebe", "cash"]);
    expect(vm.score).not.toBeNull();
    expect(vm.scorePiliers).not.toBeNull();
    expect(vm.alerteInvestissement).toBe(false);
  });

  it("génère les alertes critiques si les KPI sont dégradés", () => {
    const vm = buildSyntheseViewModel(
      makeKpis({
        ca: 120000,
        disponibilites: -1200,
        bfr: 180000,
        ebe: -800,
        grossMarginRate: 5,
        marge_ebitda: -2,
        resultat_net: -6000,
        roce: -0.08,
        roe: -0.11,
        rot_bfr: 250,
        tcam: -15,
        point_mort: 200000,
        fte: -3000,
        solvabilite: 0.1,
        gearing: 4,
        liq_gen: 0.4,
        liq_red: 0.3,
        liq_imm: 0.05,
        tn: -60000,
        ratio_immo: 0.2
      })
    );

    expect(vm.alerts.length).toBeGreaterThanOrEqual(3);
    expect(vm.alerteInvestissement).toBe(true);
    expect(vm.actions.length).toBeGreaterThan(0);
  });
});
