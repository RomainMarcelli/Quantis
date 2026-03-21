// File: lib/dashboard/premiumDashboardAdapter.test.ts
// Role: valide le mapping KPI premium et les helpers numeriques (score, offset SVG, interpolation).
import { describe, expect, it } from "vitest";
import type { CalculatedKpis } from "@/types/analysis";
import {
  clamp,
  computeEbeProgressPercent,
  computeHealthStrokeDashoffset,
  getPremiumHealthState,
  interpolateAnimatedValue,
  toPremiumKpis
} from "@/lib/dashboard/premiumDashboardAdapter";

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

describe("toPremiumKpis", () => {
  it("maps existing KPI keys to premium contract", () => {
    const result = toPremiumKpis(
      makeKpis({
        ca: 100000,
        disponibilites: 25000,
        ebe: 14000,
        healthScore: 82,
        tcam: 0.12,
        cashRunwayMonths: 7.1
      })
    );

    expect(result).toEqual({
      ca: 100000,
      tresorerie: 25000,
      ebe: 14000,
      healthScore: 82,
      croissance: 0.12,
      runway: 7.1
    });
  });
});

describe("getPremiumHealthState", () => {
  it("returns green state when score is above 80", () => {
    expect(getPremiumHealthState(81).severity).toBe("excellent");
  });

  it("returns orange state when score is above 40 and below or equal 80", () => {
    expect(getPremiumHealthState(60).severity).toBe("warning");
  });

  it("returns red state when score is 40 or below", () => {
    expect(getPremiumHealthState(40).severity).toBe("critical");
  });
});

describe("computeHealthStrokeDashoffset", () => {
  it("returns full offset at score 0", () => {
    const offset = computeHealthStrokeDashoffset(0, 130);
    const circumference = 2 * Math.PI * 130;
    expect(offset).toBeCloseTo(circumference, 4);
  });

  it("returns half offset at score 50", () => {
    const offset = computeHealthStrokeDashoffset(50, 130);
    const circumference = 2 * Math.PI * 130;
    expect(offset).toBeCloseTo(circumference / 2, 4);
  });
});

describe("animation helpers", () => {
  it("keeps animated value bounded to target", () => {
    expect(interpolateAnimatedValue(0, 100, 2)).toBe(100);
    expect(interpolateAnimatedValue(100, 0, 2)).toBe(0);
  });

  it("computes ebe progress in percent and clamps to 100", () => {
    expect(computeEbeProgressPercent(25000, 50000)).toBe(50);
    expect(computeEbeProgressPercent(100000, 50000)).toBe(100);
  });

  it("clamps numeric values", () => {
    expect(clamp(-2, 0, 10)).toBe(0);
    expect(clamp(12, 0, 10)).toBe(10);
    expect(clamp(5, 0, 10)).toBe(5);
  });
});
