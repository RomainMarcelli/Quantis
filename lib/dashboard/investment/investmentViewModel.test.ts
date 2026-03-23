// File: lib/dashboard/investment/investmentViewModel.test.ts
// Role: vérifie la logique métier pure de la section Investissement (BFR, DSO/DPO, état matériel).
import { describe, expect, it } from "vitest";
import {
  buildBfrVariationSeries,
  buildClientsVsSuppliersComparison,
  normalizeEquipmentState
} from "@/lib/dashboard/investment/investmentViewModel";

describe("buildBfrVariationSeries", () => {
  it("retourne une série mensuelle de 12 points", () => {
    const points = buildBfrVariationSeries(120000);

    expect(points).toHaveLength(12);
    expect(points[0]?.month).toBe("Jan");
    expect(points[11]?.month).toBe("Déc");
  });
});

describe("buildClientsVsSuppliersComparison", () => {
  it("retourne un statut risk si DSO > DPO", () => {
    const result = buildClientsVsSuppliersComparison(75, 45);

    expect(result.status).toBe("risk");
    expect(result.deltaDays).toBe(30);
  });

  it("retourne un statut positive si DSO < DPO", () => {
    const result = buildClientsVsSuppliersComparison(45, 60);

    expect(result.status).toBe("positive");
    expect(result.deltaDays).toBe(-15);
  });
});

describe("normalizeEquipmentState", () => {
  it("borne la valeur entre 0 et 100", () => {
    expect(normalizeEquipmentState(140)).toBe(100);
    expect(normalizeEquipmentState(-20)).toBe(0);
  });
});
