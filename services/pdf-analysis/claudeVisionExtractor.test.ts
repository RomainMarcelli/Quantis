import { describe, expect, it } from "vitest";
import { computeConfidenceScore, applyUniteMultiplier, parseResponse } from "./claudeVisionExtractor";

describe("applyUniteMultiplier", () => {
  it("multiplie par 1000 si milliers_euros", () => {
    const data = {
      unite: "milliers_euros",
      total_actif: 454030,
      ventes_march: 752298,
      resultat_exercice: 24219
    };
    const result = applyUniteMultiplier(data);
    expect(result.total_actif).toBe(454030000);
    expect(result.ventes_march).toBe(752298000);
    expect(result.resultat_exercice).toBe(24219000);
  });

  it("ne multiplie pas si euros", () => {
    const data = { unite: "euros", total_actif: 8117151 };
    const result = applyUniteMultiplier(data);
    expect(result.total_actif).toBe(8117151);
  });

  it("ne multiplie pas fiscal_year", () => {
    const data = { unite: "milliers_euros", total_actif: 100, fiscal_year: 2024 };
    const result = applyUniteMultiplier(data);
    expect(result.fiscal_year).toBe(2024);
    expect(result.total_actif).toBe(100000);
  });

  it("détecte et évite la double multiplication", () => {
    const data = {
      unite: "milliers_euros",
      total_actif: 7773000000,
      res_net: 659400000,
    };
    const result = applyUniteMultiplier(data);
    expect(result.total_actif).toBe(7773000000);
    expect(result.res_net).toBe(659400000);
  });
});

describe("parseResponse", () => {
  it("parse correctement un JSON avec blocs ```json```", () => {
    const raw = '```json\n{"total_actif": 454030, "unite": "milliers_euros"}\n```';
    const result = parseResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.total_actif).toBe(454030);
    expect(result!.unite).toBe("milliers_euros");
  });

  it("parse les nombres string avec espaces", () => {
    const raw = '{"total_actif": "454 030", "unite": "euros"}';
    const result = parseResponse(raw);
    expect(result!.total_actif).toBe(454030);
  });

  it("retourne null pour un JSON invalide", () => {
    expect(parseResponse("pas du json")).toBeNull();
  });

  it("retourne null pour les champs absents", () => {
    const result = parseResponse('{"total_actif": 100, "unite": "euros"}');
    expect(result!.salaires).toBeNull();
    expect(result!.ace).toBeNull();
  });

  it("parse les grands nombres avec espaces", () => {
    const result = parseResponse('{"ventes_march": "16 047 882", "unite": "euros"}');
    expect(result!.ventes_march).toBe(16047882);
  });

  it("parse les nombres négatifs", () => {
    const result = parseResponse('{"resultat_exercice": -2657615, "unite": "euros"}');
    expect(result!.resultat_exercice).toBe(-2657615);
  });
});

describe("parseResponse — fiscal_year", () => {
  it("accepte fiscal_year number", () => {
    const result = parseResponse('{"fiscal_year": 2024, "unite": "euros"}');
    expect(result!.fiscal_year).toBe(2024);
  });

  it("accepte fiscal_year string", () => {
    const result = parseResponse('{"fiscal_year": "2024", "unite": "euros"}');
    expect(result!.fiscal_year).toBe(2024);
  });

  it("rejette une année hors plage", () => {
    const result = parseResponse('{"fiscal_year": "1800", "unite": "euros"}');
    expect(result!.fiscal_year).toBeNull();
  });

  it("rejette fiscal_year invalide", () => {
    const result = parseResponse('{"fiscal_year": "N/A", "unite": "euros"}');
    expect(result!.fiscal_year).toBeNull();
  });
});

describe("computeConfidenceScore", () => {
  it("retourne 1.0 si tous les champs critiques et importants présents", () => {
    const data = {
      total_actif: 1, total_passif: 1, total_cp: 1,
      resultat_exercice: 1, total_prod_expl: 1, total_charges_expl: 1,
      ventes_march: 1, prod_vendue: 1, ace: 1, salaires: 1,
      charges_soc: 1, dap: 1, fournisseurs: 1, emprunts: 1
    };
    expect(computeConfidenceScore(data)).toBe(1.0);
  });

  it("retourne 0.7 si seulement champs critiques présents", () => {
    const data = {
      total_actif: 1, total_passif: 1, total_cp: 1,
      resultat_exercice: 1, total_prod_expl: 1, total_charges_expl: 1
    };
    expect(computeConfidenceScore(data)).toBeCloseTo(0.7);
  });

  it("retourne ~0.3 si seulement champs importants présents", () => {
    const data = {
      ventes_march: 1, prod_vendue: 1, ace: 1, salaires: 1,
      charges_soc: 1, dap: 1, fournisseurs: 1, emprunts: 1
    };
    expect(computeConfidenceScore(data)).toBeCloseTo(0.3);
  });

  it("retourne score faible si champs critiques manquants", () => {
    expect(computeConfidenceScore({ ventes_march: 738197 })).toBeLessThan(0.5);
  });

  it("retourne 0 si aucun champ", () => {
    expect(computeConfidenceScore({})).toBe(0);
  });
});
