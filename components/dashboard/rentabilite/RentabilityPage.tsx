// File: components/dashboard/rentabilite/RentabilityPage.tsx
// Role: compose la section Rentabilité (ROE, ROCE, dépendance bancaire) avec une lecture visuelle immédiate.
"use client";

import { LeverageCard } from "@/components/dashboard/rentabilite/LeverageCard";
import { ROECard } from "@/components/dashboard/rentabilite/ROECard";
import { ROEChart } from "@/components/dashboard/rentabilite/ROEChart";
import { ROCECard } from "@/components/dashboard/rentabilite/ROCECard";
import { ROCEChart } from "@/components/dashboard/rentabilite/ROCEChart";
import {
  buildSignTrend,
  buildRentabilitySeries,
  interpretLeverage
} from "@/lib/dashboard/rentabilite/rentabilityViewModel";
import type { CalculatedKpis } from "@/types/analysis";

type RentabilityPageProps = {
  kpis: CalculatedKpis;
};

export function RentabilityPage({ kpis }: RentabilityPageProps) {
  // ROE: rendement du capital des actionnaires (vision "gain sur mon capital").
  const roeSeries = buildRentabilitySeries(kpis.roe, "roe");
  const roeTrend = buildSignTrend(kpis.roe);

  // ROCE: performance économique des capitaux engagés dans l'activité.
  const roceSeries = buildRentabilitySeries(kpis.roce, "roce");
  const roceTrend = buildSignTrend(kpis.roce);

  // Levier financier: mesure de dépendance au financement externe.
  const leverageInterpretation = interpretLeverage(kpis.effet_levier);

  return (
    <section className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_1.9fr]">
        <ROECard roe={kpis.roe} trend={roeTrend} />
        <ROEChart data={roeSeries} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.9fr]">
        <ROCECard roce={kpis.roce} trend={roceTrend} />
        <ROCEChart data={roceSeries} />
      </div>

      <LeverageCard leverage={kpis.effet_levier} interpretation={leverageInterpretation} />
    </section>
  );
}
