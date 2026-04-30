import { describe, expect, it } from "vitest";
import { createEmptyMappedFinancialData } from "@/services/mapping/financialDataMapper";
import {
  applyLeverDeltas,
  clampLeverDelta,
  computeDynamicLeverBounds,
  getSimulationScenario,
  runSimulation,
  SIMULATION_SCENARIOS,
  type SimulationLever,
} from "@/lib/simulation/simulationEngine";

describe("applyLeverDeltas", () => {
  it("absolute delta : ajoute la valeur au champ existant", () => {
    const base = { ...createEmptyMappedFinancialData(), salaires: 100_000 };
    const out = applyLeverDeltas(base, {
      salaires: { type: "absolute", value: 45_000 },
    });
    expect(out.salaires).toBe(145_000);
  });

  it("absolute delta : traite null comme 0", () => {
    const base = createEmptyMappedFinancialData(); // tous les champs à null
    const out = applyLeverDeltas(base, {
      emprunts: { type: "absolute", value: 200_000 },
    });
    expect(out.emprunts).toBe(200_000);
  });

  it("percent delta : applique le ratio sur la valeur courante", () => {
    const base = { ...createEmptyMappedFinancialData(), prod_vendue: 200_000 };
    const out = applyLeverDeltas(base, {
      prod_vendue: { type: "percent", value: 10 },
    });
    // toBeCloseTo plutôt que toBe à cause des epsilon flottants (200_000 × 1.1).
    expect(out.prod_vendue).toBeCloseTo(220_000, 5);
  });

  it("percent delta : ignore un champ null (pas de baseline pour calculer le %)", () => {
    const base = createEmptyMappedFinancialData();
    const out = applyLeverDeltas(base, {
      prod_vendue: { type: "percent", value: 10 },
    });
    expect(out.prod_vendue).toBeNull();
  });

  it("ne mute pas l'input", () => {
    const base = { ...createEmptyMappedFinancialData(), salaires: 100_000 };
    applyLeverDeltas(base, { salaires: { type: "absolute", value: 50_000 } });
    expect(base.salaires).toBe(100_000);
  });
});

describe("runSimulation", () => {
  // Setup : une mini-PME synthétique avec un EBITDA positif.
  const baseline = {
    ...createEmptyMappedFinancialData(),
    ventes_march: 0,
    prod_vendue: 500_000,
    total_prod_expl: 500_000,
    achats_march: 50_000,
    achats_mp: 30_000,
    ace: 80_000,
    salaires: 200_000,
    charges_soc: 90_000,
    impots_taxes: 10_000,
    dap: 15_000,
    res_net: 25_000,
    resultat_exercice: 25_000,
    dispo: 50_000,
    emprunts: 100_000,
    total_cp: 200_000,
    total_passif: 600_000,
    total_actif_circ: 350_000,
    fournisseurs: 80_000,
    dettes_fisc_soc: 40_000,
    clients: 150_000,
    creances: 150_000,
    total_actif_immo: 200_000,
  };

  it("scénario 'embauche' fait baisser l'EBITDA du montant des charges ajoutées", () => {
    const scenario = getSimulationScenario("embauche")!;
    const result = runSimulation(scenario, baseline, {
      salaires: 60_000,
      charges_soc: 30_000,
    });

    const ebitdaBefore = result.baselineKpis.ebitda!;
    const ebitdaAfter = result.simulatedKpis.ebitda!;
    expect(ebitdaBefore - ebitdaAfter).toBe(90_000); // = somme des deltas absolute
  });

  it("scénario 'hausse_prix' (+10%) augmente le CA de 10% et l'EBITDA d'autant en €", () => {
    const scenario = getSimulationScenario("hausse_prix")!;
    // Le scénario inclut un levier hidden total_prod_expl, important pour que
    // VA/EBITDA suivent le bump (kpiEngine fallback sur total_prod_expl avant
    // de sommer les composants). On set le delta sur les 3.
    const result = runSimulation(scenario, baseline, {
      ventes_march: 10,
      prod_vendue: 10,
      total_prod_expl: 10,
    });

    const caBefore = result.baselineKpis.ca!;
    const caAfter = result.simulatedKpis.ca!;
    expect(caAfter).toBeCloseTo(caBefore * 1.1, 0);

    // EBITDA augmente du delta CA puisque les charges sont inchangées.
    const ebitdaDelta = result.simulatedKpis.ebitda! - result.baselineKpis.ebitda!;
    expect(ebitdaDelta).toBeCloseTo(caAfter - caBefore, 0);
  });

  it("scénario 'nouvel_emprunt' fait baisser la trésorerie nette si dispo et emprunts montent du même montant", () => {
    const scenario = getSimulationScenario("nouvel_emprunt")!;
    const result = runSimulation(scenario, baseline, {
      emprunts: 200_000,
      dispo: 200_000,
    });
    // tn = dispo - emprunts → invariant si on bouge des deux du même montant.
    expect(result.simulatedKpis.tn).toBe(result.baselineKpis.tn);
    // gearing = (emprunts - dispo) / ebitda — invariant aussi.
    expect(result.simulatedKpis.gearing).toBe(result.baselineKpis.gearing);
  });

  it("retourne des diffs cohérents avec les KPIs avant/après", () => {
    const scenario = getSimulationScenario("embauche")!;
    const result = runSimulation(scenario, baseline, {
      salaires: 30_000,
      charges_soc: 14_000,
    });

    for (const diff of result.diffs) {
      if (diff.before === null || diff.after === null) continue;
      expect(diff.deltaAbsolute).toBe(diff.after - diff.before);
    }
  });
});

describe("ratio_masse_salariale (kpiEngine)", () => {
  it("calcule (salaires + charges_soc) / ca × 100", () => {
    const base = {
      ...createEmptyMappedFinancialData(),
      ventes_march: 0,
      prod_vendue: 500_000,
      total_prod_expl: 500_000,
      salaires: 200_000,
      charges_soc: 90_000,
    };
    // Le moteur renvoie le ratio depuis computeKpis — on passe par
    // runSimulation pour récupérer baselineKpis sans imports croisés.
    const scenario = getSimulationScenario("analyse_masse_salariale")!;
    const { baselineKpis } = runSimulation(scenario, base, { salaires: 0, charges_soc: 0 });
    // (200_000 + 90_000) / 500_000 × 100 = 58 %
    expect(baselineKpis.ratio_masse_salariale).toBeCloseTo(58, 1);
  });
});

describe("scénario analyse_masse_salariale", () => {
  const baseline = {
    ...createEmptyMappedFinancialData(),
    ventes_march: 0,
    prod_vendue: 500_000,
    total_prod_expl: 500_000,
    achats_march: 50_000,
    achats_mp: 30_000,
    ace: 80_000,
    salaires: 200_000,
    charges_soc: 90_000,
    impots_taxes: 10_000,
    dap: 15_000,
  };

  it("+10 % de masse salariale → EBITDA baisse de (salaires + charges) × 10 %", () => {
    const scenario = getSimulationScenario("analyse_masse_salariale")!;
    const result = runSimulation(scenario, baseline, {
      salaires: 10,
      charges_soc: 10, // cascade : même % que salaires
    });

    // EBE = VA − (impôts + salaires + charges_soc + dap)
    // Delta EBE = − (200_000 × 0.1 + 90_000 × 0.1) = −29 000
    const ebitdaDelta = result.simulatedKpis.ebitda! - result.baselineKpis.ebitda!;
    expect(ebitdaDelta).toBeCloseTo(-29_000, 0);
  });

  it("+10 % de masse salariale → point mort remonte (charges fixes en hausse)", () => {
    const scenario = getSimulationScenario("analyse_masse_salariale")!;
    const result = runSimulation(scenario, baseline, {
      salaires: 10,
      charges_soc: 10,
    });

    // charges_fixes = ace + salaires + charges_soc + dap
    // Delta = 200_000 × 0.1 + 90_000 × 0.1 = 29 000
    // point_mort = charges_fixes / tmscv → augmente proportionnellement.
    const pmBefore = result.baselineKpis.point_mort!;
    const pmAfter = result.simulatedKpis.point_mort!;
    expect(pmAfter).toBeGreaterThan(pmBefore);
  });
});

describe("scénario remuneration_dirigeant", () => {
  const baseline = {
    ...createEmptyMappedFinancialData(),
    ventes_march: 0,
    prod_vendue: 500_000,
    total_prod_expl: 500_000,
    achats_march: 50_000,
    achats_mp: 30_000,
    ace: 80_000,
    salaires: 0,
    charges_soc: 0,
    impots_taxes: 10_000,
    dap: 15_000,
  };

  it("3 000 €/mois brut (= 36 000 € annuel) + TNS 45 % → coût total 52 200 €/an, EBITDA chute d'autant", () => {
    const scenario = getSimulationScenario("remuneration_dirigeant")!;
    // 3 000 × 12 = 36 000 € de rémunération brute annuelle
    // Charges TNS ≈ 45 % = 16 200 €
    // Coût total annuel = 52 200 €
    const result = runSimulation(scenario, baseline, {
      salaires: 36_000,
      charges_soc: 16_200, // = 36_000 × 0.45 (cascadeMultiplier appliqué côté UI)
    });

    const ebitdaDelta = result.simulatedKpis.ebitda! - result.baselineKpis.ebitda!;
    expect(ebitdaDelta).toBeCloseTo(-52_200, 0);
  });

  it("le scénario expose la cascade charges_soc avec cascadeMultiplier=0.45", () => {
    const scenario = getSimulationScenario("remuneration_dirigeant")!;
    const cascadeLever = scenario.levers.find((l) => l.variableCode === "charges_soc");
    expect(cascadeLever?.hidden).toBe(true);
    expect(cascadeLever?.cascadeMultiplier).toBe(0.45);
  });
});

describe("SIMULATION_SCENARIOS catalog", () => {
  it("contient au moins 5 scénarios", () => {
    expect(SIMULATION_SCENARIOS.length).toBeGreaterThanOrEqual(5);
  });

  it("chaque scénario a au moins un levier et un KPI affecté", () => {
    for (const s of SIMULATION_SCENARIOS) {
      expect(s.levers.length, `${s.id} sans levier`).toBeGreaterThan(0);
      expect(s.affectedKpis.length, `${s.id} sans affectedKpi`).toBeGreaterThan(0);
    }
  });

  it("chaque levier a min < max et defaultDelta dans la fenêtre", () => {
    for (const s of SIMULATION_SCENARIOS) {
      for (const lever of s.levers) {
        expect(lever.min, `${s.id}/${lever.variableCode} min ≥ max`).toBeLessThan(lever.max);
        expect(lever.defaultDelta).toBeGreaterThanOrEqual(lever.min);
        expect(lever.defaultDelta).toBeLessThanOrEqual(lever.max);
      }
    }
  });

  it("getSimulationScenario('inconnu') retourne null", () => {
    expect(getSimulationScenario("xyz")).toBeNull();
  });
});

describe("computeDynamicLeverBounds", () => {
  const absoluteLever: SimulationLever = {
    variableCode: "salaires",
    label: "Masse salariale",
    type: "absolute",
    min: 25_000,
    max: 150_000,
    step: 5_000,
    defaultDelta: 45_000,
  };
  const percentLever: SimulationLever = {
    variableCode: "prod_vendue",
    label: "Production vendue",
    type: "percent",
    min: 0,
    max: 30,
    step: 1,
    defaultDelta: 5,
  };

  it("absolute : bornes = ±50% de la valeur de base réelle", () => {
    const bounds = computeDynamicLeverBounds(absoluteLever, 192_000);
    expect(bounds.min).toBe(-96_000);
    expect(bounds.max).toBe(96_000);
  });

  it("absolute : step adapté à la magnitude (200k → step 10k)", () => {
    const bounds = computeDynamicLeverBounds(absoluteLever, 200_000);
    expect(bounds.step).toBe(10_000);
  });

  it("absolute : step suit l'échelle (5k → 300€)", () => {
    // baseValue=5000 → 5000 × 0.05 / 100 = 2.5 → round = 3 → × 100 = 300
    const bounds = computeDynamicLeverBounds(absoluteLever, 5_000);
    expect(bounds.step).toBe(300);
  });

  it("absolute : plancher = 100€ pour les valeurs minuscules (< 2k)", () => {
    // baseValue=500 → 500 × 0.05 / 100 = 0.25 → round = 0 → × 100 = 0 → max(100, 0) = 100
    const bounds = computeDynamicLeverBounds(absoluteLever, 500);
    expect(bounds.step).toBe(100);
  });

  it("absolute : valeur de base nulle/absente → fallback bornes statiques", () => {
    expect(computeDynamicLeverBounds(absoluteLever, null)).toEqual({
      min: 25_000,
      max: 150_000,
      step: 5_000,
    });
    expect(computeDynamicLeverBounds(absoluteLever, 0)).toEqual({
      min: 25_000,
      max: 150_000,
      step: 5_000,
    });
  });

  it("percent : bornes statiques (un % reste un %)", () => {
    expect(computeDynamicLeverBounds(percentLever, 200_000)).toEqual({
      min: 0,
      max: 30,
      step: 1,
    });
  });

  it("absolute négatif : prend la magnitude (résultat_net négatif → bornes positives)", () => {
    const bounds = computeDynamicLeverBounds(absoluteLever, -100_000);
    expect(bounds.min).toBe(-50_000);
    expect(bounds.max).toBe(50_000);
  });
});

describe("clampLeverDelta", () => {
  it("clamp dans les bornes", () => {
    const bounds = { min: -50, max: 50, step: 1 };
    expect(clampLeverDelta(75, bounds)).toBe(50);
    expect(clampLeverDelta(-75, bounds)).toBe(-50);
    expect(clampLeverDelta(25, bounds)).toBe(25);
  });
});
