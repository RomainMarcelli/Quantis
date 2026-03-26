// File: components/dashboard/navigation/InvestmentTest.test.tsx
// Role: vérifie le rendu principal de la section Investissement (test) et son alimentation par KPI.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InvestmentTest } from "@/components/dashboard/navigation/InvestmentTest";
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

describe("InvestmentTest", () => {
  it("affiche les blocs clés de la section investissement test", () => {
    const html = renderToStaticMarkup(
      <InvestmentTest
        kpis={makeKpis({
          bfr: 145000,
          ratio_immo: 1.45,
          rot_bfr: 9,
          dso: 45,
          rot_stocks: 22,
          dpo: 58
        })}
      />
    );

    expect(html).toContain("Clients &amp; fournisseurs");
    expect(html).toContain("Cash immobilisé");
    expect(html).toContain("Tension de trésorerie");
    expect(html).toContain("Vitesse du cycle d&#x27;exploitation");
    expect(html).toContain("Délai clients (DSO)");
    expect(html).toContain("OPTIMISATION BFR");
  });
});


