// File: components/dashboard/rentabilite/RentabilityPage.test.tsx
// Role: tests de rendu de la section Rentabilité (ROE, ROCE, levier financier).
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RentabilityPage } from "@/components/dashboard/rentabilite/RentabilityPage";
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

describe("RentabilityPage", () => {
  it("affiche les trois blocs principaux de la section", () => {
    const html = renderToStaticMarkup(
      <RentabilityPage
        kpis={makeKpis({
          roe: 0.16,
          roce: 0.12,
          effet_levier: 1.4
        })}
      />
    );

    expect(html).toContain("Gain sur mon capital");
    expect(html).toContain("Performance de l&#x27;activité");
    expect(html).toContain("Dépendance bancaire");
  });

  it("rend un indicateur visuel négatif quand le KPI est négatif", () => {
    const html = renderToStaticMarkup(
      <RentabilityPage
        kpis={makeKpis({
          roe: -0.11,
          roce: -0.08,
          effet_levier: 2.3
        })}
      />
    );

    expect(html).toContain("Rentabilité négative");
  });
});
