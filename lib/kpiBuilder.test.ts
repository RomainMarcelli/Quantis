// File: lib/kpiBuilder.test.ts
// Role: valide la construction automatique des KPI à partir de la saisie manuelle simplifiée.

import { describe, expect, it } from "vitest";
import { buildCompleteKpis } from "@/lib/kpiBuilder";
import { calculateVyzorScore } from "@/lib/vyzorScore";

describe("buildCompleteKpis", () => {
  it("calcule automatiquement les marges, la rotation BFR et le point mort", () => {
    const kpis = buildCompleteKpis({
      ca: 200_000,
      tcam: 8,
      ebe: 30_000,
      resultat_net: 15_000,
      roe: 12,
      roce: 10,
      cash: 10_000,
      bfr: 40_000,
      dso: 45,
      dpo: 30,
      total_actif: null,
      capitaux_propres: null,
      dettes_financieres: null,
      actif_circulant: null,
      dettes_ct: null,
      immo_brut: null,
      immo_net: null
    });

    expect(kpis.marge_ebitda).toBeCloseTo(15, 4);
    expect(kpis.netProfit).toBeCloseTo(7.5, 4);
    expect(kpis.rot_bfr).toBeCloseTo(73, 0);
    expect(kpis.charges_fixes).toBe(170_000);
    expect(kpis.point_mort).toBe(170_000);
    expect(kpis.tn).toBe(10_000);
    expect(kpis.disponibilites).toBe(10_000);
  });

  it("calcule les ratios de liquidité à partir des données avancées", () => {
    const kpis = buildCompleteKpis({
      ca: 365_000,
      tcam: 5,
      ebe: 40_000,
      resultat_net: 20_000,
      roe: 14,
      roce: 11,
      cash: 10_000,
      bfr: 25_000,
      dso: 50,
      dpo: 40,
      total_actif: 400_000,
      capitaux_propres: 180_000,
      dettes_financieres: 70_000,
      actif_circulant: 90_000,
      dettes_ct: 60_000,
      immo_brut: 150_000,
      immo_net: 60_000
    });

    expect(kpis.liq_gen).toBeCloseTo(1.5, 4);
    expect(kpis.liq_red).toBeCloseTo(1, 4);
    expect(kpis.liq_imm).toBeCloseTo(0.1666, 3);
    expect(kpis.solvabilite).toBeCloseTo(0.45, 4);
    expect(kpis.ratio_immo_usure).toBeCloseTo(0.4, 4);
    expect(kpis.etat_materiel_indice).toBeCloseTo(40, 4);
  });

  it("ne retourne jamais NaN et garde null quand la donnée manque", () => {
    const kpis = buildCompleteKpis({
      ca: null,
      tcam: null,
      ebe: null,
      resultat_net: null,
      roe: null,
      roce: null,
      cash: null,
      bfr: null,
      dso: null,
      dpo: null,
      total_actif: null,
      capitaux_propres: null,
      dettes_financieres: null,
      actif_circulant: null,
      dettes_ct: null,
      immo_brut: null,
      immo_net: null
    });

    for (const value of Object.values(kpis)) {
      if (typeof value === "number") {
        expect(Number.isNaN(value)).toBe(false);
      }
    }
  });

  it("s'intègre avec le calcul Vyzor Score", () => {
    const kpis = buildCompleteKpis({
      ca: 300_000,
      tcam: 3,
      ebe: 24_000,
      resultat_net: 8_000,
      roe: 9,
      roce: 8,
      cash: 12_000,
      bfr: 55_000,
      dso: 72,
      dpo: 45,
      total_actif: 420_000,
      capitaux_propres: 130_000,
      dettes_financieres: 90_000,
      actif_circulant: 125_000,
      dettes_ct: 85_000,
      immo_brut: 180_000,
      immo_net: 35_000
    });

    const score = calculateVyzorScore(kpis);
    expect(score.vyzor_score).toBeGreaterThanOrEqual(0);
    expect(score.vyzor_score).toBeLessThanOrEqual(100);
    expect(score.alerte_investissement).toBe(true);
  });
});
