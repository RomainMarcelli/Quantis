// File: components/dashboard/navigation/FinancingTest.test.tsx
// Role: vérifie le rendu principal de la section Financement (test) et son alimentation par KPI.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FinancingTest } from "@/components/dashboard/navigation/FinancingTest";
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

describe("FinancingTest", () => {
  it("affiche les blocs clés de la section financement test", () => {
    const html = renderToStaticMarkup(
      <FinancingTest
        kpis={makeKpis({
          capacite_remboursement_annees: 2.4,
          caf: 185000,
          fte: 160000,
          liq_gen: 1.8,
          liq_red: 1.2,
          liq_imm: 0.5,
          effet_levier: 0.45
        })}
      />
    );

    expect(html).toContain("Financement &amp; solvabilité");
    expect(html).toContain("Capacité de remboursement");
    expect(html).toContain("Résistance aux imprévus");
    expect(html).toContain("Liquidit");
    expect(html).toContain("Indépendance");
    expect(html).toContain("MODÉLISATION DE FINANCEMENT");
  });
});

