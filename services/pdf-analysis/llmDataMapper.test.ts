import { describe, expect, it } from "vitest";
import { mapLlmDataToMappedFinancialData } from "./llmDataMapper";
import { computeConfidenceScore } from "./llmExtractor";

describe("mapLlmDataToMappedFinancialData", () => {
  it("mappe correctement les champs de base", () => {
    const result = mapLlmDataToMappedFinancialData({
      total_actif: 344316,
      total_passif: 344316,
      resultat_exercice: 25924,
      total_cp: 253847,
      ventes_march: 738197,
      unite: "euros"
    });
    expect(result.total_actif).toBe(344316);
    expect(result.res_net).toBe(25924);
    expect(result.total_cp).toBe(253847);
  });

  it("multiplie par 1000 si unite = milliers_euros", () => {
    const result = mapLlmDataToMappedFinancialData({
      total_actif: 344,
      resultat_exercice: 26,
      total_cp: 254,
      unite: "milliers_euros"
    });
    expect(result.total_actif).toBe(344000);
    expect(result.res_net).toBe(26000);
    expect(result.total_cp).toBe(254000);
  });

  it("ne modifie pas si euros", () => {
    const result = mapLlmDataToMappedFinancialData({
      total_actif: 8117151,
      unite: "euros"
    });
    expect(result.total_actif).toBe(8117151);
  });

  it("retourne null pour les champs absents", () => {
    const result = mapLlmDataToMappedFinancialData({
      total_actif: 344316,
      unite: "euros"
    });
    expect(result.salaires).toBeNull();
    expect(result.ace).toBeNull();
    expect(result.fournisseurs).toBeNull();
  });

  it("reconstruit res_net depuis resultat_exercice", () => {
    const result = mapLlmDataToMappedFinancialData({
      resultat_exercice: 25924,
      unite: "euros"
    });
    expect(result.res_net).toBe(25924);
    expect(result.resultat_exercice).toBe(25924);
  });

  it("reconstruit creances depuis clients + autres_creances", () => {
    const result = mapLlmDataToMappedFinancialData({
      clients: 100000,
      autres_creances: 50000,
      unite: "euros"
    });
    expect(result.creances).toBe(150000);
  });

  it("reconstruit total_stocks depuis stocks_mp + stocks_march", () => {
    const result = mapLlmDataToMappedFinancialData({
      stocks_mp: 30000,
      stocks_march: 20000,
      unite: "euros"
    });
    expect(result.total_stocks).toBe(50000);
  });

  it("gère les valeurs négatives correctement", () => {
    const result = mapLlmDataToMappedFinancialData({
      resultat_exercice: -2657615,
      total_cp: 4002315,
      unite: "euros"
    });
    expect(result.res_net).toBe(-2657615);
    expect(result.total_cp).toBe(4002315);
  });
});

describe("computeConfidenceScore (llmExtractor)", () => {
  it("retourne un score élevé si tous les champs critiques sont présents", () => {
    const data = {
      total_actif: 344316, total_passif: 344316,
      total_cp: 253847, resultat_exercice: 25924,
      total_prod_expl: 759104, total_charges_expl: 717168,
      ventes_march: 738197, ace: 282516,
      salaires: 295984, charges_soc: 129197,
      dap: 300, fournisseurs: 4497,
      dettes_fisc_soc: 85972, emprunts: null
    };
    expect(computeConfidenceScore(data)).toBeGreaterThan(0.75);
  });

  it("retourne un score faible si champs critiques manquants", () => {
    expect(computeConfidenceScore({ ventes_march: 738197 })).toBeLessThan(0.5);
  });
});
