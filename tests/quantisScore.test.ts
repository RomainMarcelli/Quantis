// File: tests/quantisScore.test.ts
// Role: valide le moteur Quantis Score contre la logique Python de référence.
import { describe, expect, it } from "vitest";
import { calculateQuantisScore, normalize } from "@/lib/quantisScore";

describe("normalize", () => {
  it("retourne 50 quand la valeur est absente ou invalide", () => {
    expect(normalize(null, 0, 100)).toBe(50);
    expect(normalize(undefined, 0, 100)).toBe(50);
    expect(normalize("abc", 0, 100)).toBe(50);
  });

  it("respecte le mode reverse exactement", () => {
    expect(normalize(20, 30, 90, true)).toBe(100);
    expect(normalize(100, 30, 90, true)).toBe(0);
    expect(normalize(60, 30, 90, true)).toBe(50);
  });

  it("respecte le mode normal exactement", () => {
    expect(normalize(80, 20, 70)).toBe(100);
    expect(normalize(10, 20, 70)).toBe(0);
    expect(normalize(45, 20, 70)).toBe(50);
  });
});

describe("calculateQuantisScore", () => {
  it("calcule le score sur un cas nominal (aligné Python)", () => {
    const result = calculateQuantisScore({
      marge_brute_pct: 48,
      marge_ebitda: 22,
      marge_nette_pct: 11,
      roce: 16,
      roe: 20,
      rot_bfr: 65,
      tcam: 10,
      point_mort: 180000,
      ca: 420000,
      fcf: 55000,
      solvabilite: 0.42,
      gearing: 0.9,
      liq_gen: 1.55,
      liq_red: 1.21,
      liq_imm: 0.87,
      tn: 70000,
      ratio_immo_usure: 0.45
    });

    expect(result.quantis_score).toBe(94.8);
    expect(result.piliers.rentabilite).toBe(95.6);
    expect(result.piliers.efficacite).toBe(85.4);
    expect(result.piliers.solvabilite).toBe(100);
    expect(result.piliers.liquidite).toBe(100);
    expect(result.alerte_investissement).toBe(false);
  });

  it("gère les valeurs nulles et applique les defaults Python", () => {
    const result = calculateQuantisScore({});

    // Avec les defaults Python: ca=1, point_mort=0, fcf=0, tn=0, ratio_usure=1.0.
    expect(result.quantis_score).toBe(46.1);
    expect(result.piliers.rentabilite).toBe(50);
    expect(result.piliers.efficacite).toBe(42.5);
    expect(result.piliers.solvabilite).toBe(50);
    expect(result.piliers.liquidite).toBe(40);
    expect(result.alerte_investissement).toBe(false);
  });

  it("clamp le score final entre 0 et 100 sur des extrêmes", () => {
    const high = calculateQuantisScore({
      marge_brute_pct: 999,
      marge_ebitda: 999,
      marge_nette_pct: 999,
      roce: 999,
      roe: 999,
      rot_bfr: -999,
      tcam: 999,
      point_mort: -999,
      ca: 1_000_000,
      fcf: 1,
      solvabilite: 999,
      gearing: -999,
      liq_gen: 999,
      liq_red: 999,
      liq_imm: 999,
      tn: 999,
      ratio_immo_usure: 1
    });

    const low = calculateQuantisScore({
      marge_brute_pct: -999,
      marge_ebitda: -999,
      marge_nette_pct: -999,
      roce: -999,
      roe: -999,
      rot_bfr: 999,
      tcam: -999,
      point_mort: 999_999,
      ca: 1,
      fcf: -1,
      solvabilite: -999,
      gearing: 999,
      liq_gen: -999,
      liq_red: -999,
      liq_imm: -999,
      tn: -999,
      ratio_immo_usure: 0
    });

    expect(high.quantis_score).toBeGreaterThanOrEqual(0);
    expect(high.quantis_score).toBeLessThanOrEqual(100);
    expect(low.quantis_score).toBeGreaterThanOrEqual(0);
    expect(low.quantis_score).toBeLessThanOrEqual(100);
  });

  it("active le malus investissement de 5 points si ratio_immo_usure < 0.30", () => {
    const base = calculateQuantisScore({
      marge_brute_pct: 45,
      marge_ebitda: 18,
      marge_nette_pct: 8,
      roce: 11,
      roe: 15,
      rot_bfr: 80,
      tcam: 6,
      point_mort: 120000,
      ca: 300000,
      fcf: 12000,
      solvabilite: 0.34,
      gearing: 1.2,
      liq_gen: 1.2,
      liq_red: 0.95,
      liq_imm: 0.6,
      tn: 12000,
      ratio_immo_usure: 0.4
    });

    const withMalus = calculateQuantisScore({
      marge_brute_pct: 45,
      marge_ebitda: 18,
      marge_nette_pct: 8,
      roce: 11,
      roe: 15,
      rot_bfr: 80,
      tcam: 6,
      point_mort: 120000,
      ca: 300000,
      fcf: 12000,
      solvabilite: 0.34,
      gearing: 1.2,
      liq_gen: 1.2,
      liq_red: 0.95,
      liq_imm: 0.6,
      tn: 12000,
      ratio_immo_usure: 0.2
    });

    expect(withMalus.alerte_investissement).toBe(true);
    expect(round(base.quantis_score - withMalus.quantis_score, 1)).toBe(5);
  });
});

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
