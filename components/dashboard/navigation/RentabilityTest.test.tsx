// File: components/dashboard/navigation/RentabilityTest.test.tsx
// Role: vérifie le rendu principal de la section Rentabilité (test) et son alimentation par KPI.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RentabilityTest } from "@/components/dashboard/navigation/RentabilityTest";
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

describe("RentabilityTest", () => {
  it("affiche les blocs clés de la section rentabilité test", () => {
    const html = renderToStaticMarkup(
      <RentabilityTest
        kpis={makeKpis({
          roe: 0.185,
          roce: 0.142,
          effet_levier: 0.45
        })}
      />
    );

    expect(html).toContain("Rentabilité &amp; valeur actionnariale");
    expect(html).toContain("Rentabilité actionnariale");
    expect(html).toContain("Rentabilité opérationnelle");
    expect(html).toContain("Analyse de la création de valeur");
    expect(html).toContain("Dépendance bancaire");
    expect(html).toContain("RECOMMANDATION STRATÉGIQUE");
  });
});
