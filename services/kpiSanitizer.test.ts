import { describe, expect, it } from "vitest";
import { createEmptyMappedFinancialData } from "@/services/mapping/financialDataMapper";
import { ABERRANT_VALUE_THRESHOLD, sanitizeMappedData } from "@/services/kpiSanitizer";

describe("sanitizeMappedData", () => {
  it("preserves values below the 10^12 threshold", () => {
    const input = {
      ...createEmptyMappedFinancialData(),
      ventes_march: 24_000_000, // CA réaliste 24M€
      total_stocks: 800_000_000, // 800M€ — gros mais plausible
      salaires: 5_000_000,
    };
    const { sanitized, warnings } = sanitizeMappedData(input);
    expect(warnings).toEqual([]);
    expect(sanitized.ventes_march).toBe(24_000_000);
    expect(sanitized.total_stocks).toBe(800_000_000);
    expect(sanitized.salaires).toBe(5_000_000);
  });

  it("rejects values above 10^12 € (case SORETOLE: stocks at 6.6e26)", () => {
    const input = {
      ...createEmptyMappedFinancialData(),
      total_stocks: 6.566496377951619e26, // bug parser PDF v1
      salaires: 18_192_711_729_205, // 18 mille milliards €
      ventes_march: 24_000_000, // valeur saine
    };
    const { sanitized, warnings } = sanitizeMappedData(input);
    expect(sanitized.total_stocks).toBeNull();
    expect(sanitized.salaires).toBeNull();
    expect(sanitized.ventes_march).toBe(24_000_000); // intact
    expect(warnings.map((w) => w.field).sort()).toEqual(["salaires", "total_stocks"]);
    expect(warnings.every((w) => w.reason === "exceeds_threshold")).toBe(true);
  });

  it("rejects negative values below -10^12 €", () => {
    const input = {
      ...createEmptyMappedFinancialData(),
      resultat_exercice: -2 * ABERRANT_VALUE_THRESHOLD,
    };
    const { sanitized, warnings } = sanitizeMappedData(input);
    expect(sanitized.resultat_exercice).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0].field).toBe("resultat_exercice");
  });

  it("rejects non-finite values (Infinity, NaN)", () => {
    const input = {
      ...createEmptyMappedFinancialData(),
      total_actif: Number.POSITIVE_INFINITY,
      total_passif: Number.NaN,
    };
    const { sanitized, warnings } = sanitizeMappedData(input);
    expect(sanitized.total_actif).toBeNull();
    expect(sanitized.total_passif).toBeNull();
    expect(warnings.every((w) => w.reason === "non_finite")).toBe(true);
  });

  it("does nothing on already-clean empty data", () => {
    const empty = createEmptyMappedFinancialData();
    const { sanitized, warnings } = sanitizeMappedData(empty);
    expect(warnings).toEqual([]);
    expect(sanitized).toEqual(empty);
  });
});
