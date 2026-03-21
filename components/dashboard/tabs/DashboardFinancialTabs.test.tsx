// File: components/dashboard/tabs/DashboardFinancialTabs.test.tsx
// Role: tests du sous-menu horizontal financier (menu + contenu selon onglet actif).
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DashboardFinancialTabContent,
  DashboardFinancialTabsMenu
} from "@/components/dashboard/tabs/DashboardFinancialTabs";
import { buildAnalysisDashboardViewModel } from "@/lib/dashboard/analysisDashboardViewModel";
import type { CalculatedKpis } from "@/types/analysis";

function makeKpis(overrides: Partial<CalculatedKpis> = {}): CalculatedKpis {
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

describe("DashboardFinancialTabs", () => {
  it("affiche les 4 onglets", () => {
    const html = renderToStaticMarkup(
      <DashboardFinancialTabsMenu activeTab={null} onChange={() => {}} />
    );

    expect(html).toContain("Création de valeur");
    expect(html).toContain("Investissement");
    expect(html).toContain("Financement");
    expect(html).toContain("Rentabilité");
  });

  it("affiche le contenu initial quand aucun onglet n'est actif", () => {
    const kpis = makeKpis({ ca: 200000, healthScore: 72 });
    const html = renderToStaticMarkup(
      <DashboardFinancialTabContent
        activeTab={null}
        kpis={kpis}
        viewModel={buildAnalysisDashboardViewModel(kpis)}
      />
    );

    expect(html).toContain("Alertes");
    expect(html).toContain("KPI par blocs métier");
  });

  it("affiche la section graphes pour l'onglet création de valeur", () => {
    const kpis = makeKpis({
      ca: 200000,
      tcam: 0.11,
      ebe: 33000,
      resultat_net: 22000,
      tmscv: 0.31,
      charges_fixes: 70000,
      charges_var: 0.64,
      point_mort: 180000
    });

    const html = renderToStaticMarkup(
      <DashboardFinancialTabContent
        activeTab="creation-valeur"
        kpis={kpis}
        viewModel={buildAnalysisDashboardViewModel(kpis)}
      />
    );

    expect(html).toContain("Graphique point mort");
  });

  it("affiche la section investissement sur l'onglet Investissement", () => {
    const kpis = makeKpis({
      bfr: 98000,
      rot_bfr: 76,
      rot_stocks: 34,
      dso: 60,
      dpo: 45,
      etat_materiel_indice: 68
    });

    const html = renderToStaticMarkup(
      <DashboardFinancialTabContent
        activeTab="investissement-bfr"
        kpis={kpis}
        viewModel={buildAnalysisDashboardViewModel(kpis)}
      />
    );

    expect(html).toContain("Argent bloqué (BFR)");
    expect(html).toContain("Clients vs Fournisseurs");
  });

  it("affiche la section financement sur l'onglet Financement", () => {
    const kpis = makeKpis({
      capacite_remboursement_annees: 3.1,
      liq_gen: 1.25,
      liq_red: 1.08,
      liq_imm: 0.91,
      caf: 42000,
      effet_levier: 1.35,
      fte: 33000
    });

    const html = renderToStaticMarkup(
      <DashboardFinancialTabContent
        activeTab="financement"
        kpis={kpis}
        viewModel={buildAnalysisDashboardViewModel(kpis)}
      />
    );

    expect(html).toContain("Capacité de remboursement");
    expect(html).toContain("Cash généré (net)");
  });

  it("affiche la section rentabilité sur l'onglet Rentabilité", () => {
    const kpis = makeKpis({
      roe: 0.14,
      roce: 0.1,
      effet_levier: 1.3
    });

    const html = renderToStaticMarkup(
      <DashboardFinancialTabContent
        activeTab="rentabilite"
        kpis={kpis}
        viewModel={buildAnalysisDashboardViewModel(kpis)}
      />
    );

    expect(html).toContain("Gain sur mon capital");
    expect(html).toContain("Performance de l&#x27;activité");
    expect(html).toContain("Dépendance bancaire");
  });
});
