// File: components/dashboard/investment/InvestmentPage.test.tsx
// Role: tests de rendu de la section Investissement (BFR, rotation, comparaison DSO/DPO, état matériel).
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InvestmentPage } from "@/components/dashboard/investment/InvestmentPage";
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

describe("InvestmentPage", () => {
  it("affiche les blocs principaux de la section Investissement", () => {
    const html = renderToStaticMarkup(
      <InvestmentPage
        kpis={makeKpis({
          bfr: 95000,
          rot_bfr: 77,
          rot_stocks: 38,
          dso: 61,
          dpo: 42,
          etat_materiel_indice: 72
        })}
      />
    );

    expect(html).toContain("Argent bloqué (BFR)");
    expect(html).toContain("Variation du BFR");
    expect(html).toContain("Jours à avancer (Rotation du BFR)");
    expect(html).toContain("Clients vs Fournisseurs");
    expect(html).toContain("État du matériel");
  });
});
