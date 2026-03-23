// File: components/dashboard/tabs/valueCreationCharts.test.tsx
// Role: tests de rendu des composants graphiques de la section Création de valeur.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BreakEvenChart } from "@/components/dashboard/tabs/BreakEvenChart";
import { ChartEBE } from "@/components/dashboard/tabs/ChartEBE";
import { ChartNetResult } from "@/components/dashboard/tabs/ChartNetResult";
import { ChartRevenue } from "@/components/dashboard/tabs/ChartRevenue";
import { ChartTMSCV } from "@/components/dashboard/tabs/ChartTMSCV";
import {
  buildBreakEvenModel,
  buildMonthlyRevenueSeries,
  buildTmscvPieData
} from "@/lib/dashboard/tabs/valueCreationData";

const monthlyData = buildMonthlyRevenueSeries({
  ca: 120000,
  tcam: 0.1,
  ebe: 24000,
  resultatNet: 14000
});

describe("value creation chart components", () => {
  it("renders revenue and KPI chart titles", () => {
    const html = renderToStaticMarkup(
      <>
        <ChartRevenue ca={120000} data={monthlyData} />
        <ChartEBE ebe={24000} data={monthlyData} />
        <ChartNetResult netResult={14000} data={monthlyData} />
        <ChartTMSCV tmscv={0.32} data={buildTmscvPieData(0.32)} />
      </>
    );

    expect(html).toContain("Chiffre d&#x27;affaires");
    expect(html).toContain("Rentabilité opérationnelle");
    expect(html).toContain("Résultat net");
    expect(html).toContain("TMSCV");
    expect(html).toContain("Marge sur coûts variables");
  });

  it("renders break-even chart labels and zones", () => {
    const html = renderToStaticMarkup(
      <BreakEvenChart
        model={buildBreakEvenModel({
          ca: 200000,
          chargesFixes: 60000,
          chargesVariables: 0.65,
          pointMort: 170000
        })}
      />
    );

    expect(html).toContain("Graphique point mort");
    expect(html).toContain("Volume de point mort");
    expect(html).toContain("Zone d&#x27;activité non rentable.");
    expect(html).toContain("Zone d&#x27;activité rentable.");
  });
});
