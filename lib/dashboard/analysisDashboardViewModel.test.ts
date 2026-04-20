import { describe, expect, it } from "vitest";
import type { CalculatedKpis } from "@/types/analysis";
import { buildAnalysisDashboardViewModel } from "@/lib/dashboard/analysisDashboardViewModel";

describe("analysisDashboardViewModel", () => {
  it("builds score metadata with expected severity and top card mapping", () => {
    const viewModel = buildAnalysisDashboardViewModel(
      createKpis({
        healthScore: 45,
        disponibilites: 22000,
        cashRunwayMonths: 8
      })
    );

    expect(viewModel.score.value).toBe(45);
    expect(viewModel.score.severity).toBe("red");
    expect(viewModel.score.label).toBe("Critique");

    const cashCard = viewModel.topCards.find((card) => card.id === "cash");
    const healthCard = viewModel.topCards.find((card) => card.id === "health");

    expect(cashCard?.value).toBe(22000);
    expect(cashCard?.severity).toBe("green");
    expect(healthCard?.value).toBe(45);
    expect(healthCard?.severity).toBe("red");
  });

  it("creates alerts according to fixed thresholds", () => {
    const viewModel = buildAnalysisDashboardViewModel(
      createKpis({
        healthScore: 65,
        liq_imm: 0.4,
        dso: 95,
        dpo: 20,
        rot_bfr: 200
      })
    );

    expect(viewModel.alerts.count).toBe(5);
    expect(viewModel.alerts.hasRed).toBe(true);
    expect(viewModel.alerts.items.every((item) => item.severity === "red" || item.severity === "orange")).toBe(true);

    const alertIds = viewModel.alerts.items.map((item) => item.id);
    expect(alertIds).toContain("health-score");
    expect(alertIds).toContain("liq-imm");
    expect(alertIds).toContain("dso");
    expect(alertIds).toContain("cycle-gap");
    expect(alertIds).toContain("rot-bfr");
  });

  it("maps kpis into business sections without recalculating formulas in UI", () => {
    const viewModel = buildAnalysisDashboardViewModel(
      createKpis({
        ca: 480000,
        tcam: 8.3,
        ebe: 68000,
        tmscv: 0.29,
        resultat_net: 42000,
        bfr: 12000,
        rot_bfr: 70,
        rot_stocks: 42,
        dso: 58,
        dpo: 44,
        etat_materiel_indice: 52,
        caf: 55000,
        capacite_remboursement_annees: 2.4,
        fte: 47000,
        liq_gen: 1.5,
        liq_red: 1.1,
        liq_imm: 0.8,
        roe: 0.14,
        roce: 0.11,
        effet_levier: 0.03
      })
    );

    const creation = viewModel.sections.find((section) => section.id === "creation-valeur");
    const financement = viewModel.sections.find((section) => section.id === "financement");
    const rentabilite = viewModel.sections.find((section) => section.id === "rentabilite");

    expect(creation?.metrics.find((item) => item.key === "ca")?.value).toBe(480000);
    expect(creation?.metrics.find((item) => item.key === "ebe")?.value).toBe(68000);
    expect(financement?.metrics.find((item) => item.key === "capacite_remboursement_annees")?.value).toBe(2.4);
    expect(rentabilite?.metrics.find((item) => item.key === "roe")?.value).toBe(0.14);
  });
});

function createKpis(overrides: Partial<CalculatedKpis> = {}): CalculatedKpis {
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
    ...overrides
  };
}
