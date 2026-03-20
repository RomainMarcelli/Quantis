// File: components/dashboard/financement/FinancingPage.test.tsx
// Role: tests de rendu de la section Financement (capacité, sécurité liquidité, CAF, levier, cash généré).
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FinancingPage } from "@/components/dashboard/financement/FinancingPage";
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

describe("FinancingPage", () => {
  it("affiche les blocs principaux de la section Financement", () => {
    const html = renderToStaticMarkup(
      <FinancingPage
        kpis={makeKpis({
          capacite_remboursement_annees: 3.2,
          liq_gen: 1.35,
          liq_red: 1.08,
          liq_imm: 0.94,
          caf: 42000,
          effet_levier: 1.4,
          fte: 37000
        })}
      />
    );

    expect(html).toContain("Capacité de remboursement");
    expect(html).toContain("Sécurité");
    expect(html).toContain("Capacité d&#x27;autofinancement");
    expect(html).toContain("Dépendance bancaire");
    expect(html).toContain("Cash généré (net)");
  });
});
