// File: components/dashboard/tabs/ValueCreation.tsx
// Role: compose la section Création de valeur (CA, TCAM, EBE, résultat net, TMSCV, point mort).
"use client";

import { formatPercent } from "@/components/dashboard/formatting";
import { BreakEvenChart } from "@/components/dashboard/tabs/BreakEvenChart";
import { ChartEBE } from "@/components/dashboard/tabs/ChartEBE";
import { ChartNetResult } from "@/components/dashboard/tabs/ChartNetResult";
import { ChartRevenue } from "@/components/dashboard/tabs/ChartRevenue";
import { ChartTMSCV } from "@/components/dashboard/tabs/ChartTMSCV";
import { InfoPopover } from "@/components/dashboard/tabs/InfoPopover";
import {
  buildBreakEvenModel,
  buildMonthlyRevenueSeries,
  buildTmscvPieData
} from "@/lib/dashboard/tabs/valueCreationData";
import type { CalculatedKpis } from "@/types/analysis";

type ValueCreationProps = {
  kpis: CalculatedKpis;
};

export function ValueCreation({ kpis }: ValueCreationProps) {
  // Série unique alimentée par les KPI backend pour garder la cohérence des charts.
  const monthlySeries = buildMonthlyRevenueSeries({
    ca: kpis.ca,
    tcam: kpis.tcam,
    ebe: kpis.ebe,
    resultatNet: kpis.resultat_net
  });

  const tmscvPieData = buildTmscvPieData(kpis.tmscv);
  const breakEvenModel = buildBreakEvenModel({
    ca: kpis.ca,
    chargesFixes: kpis.charges_fixes,
    chargesVariables: kpis.charges_var,
    pointMort: kpis.point_mort
  });

  return (
    <section className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <ChartRevenue ca={kpis.ca} data={monthlySeries} />

        <article className="precision-card relative rounded-2xl p-5">
          {/* Info contextuelle: explique le rôle de la vitesse de croissance dans la trajectoire business. */}
          <InfoPopover
            title="TCAM"
            purpose="Suivre la vitesse de croissance moyenne de l'activité sur une base annuelle."
            displayedData="Le taux de croissance annuel moyen (%)."
            formula="TCAM = ((CA final / CA initial)^(1/n) - 1) × 100."
          />

          {/* TCAM: vitesse de croissance annuelle, indispensable pour juger l'accélération business. */}
          <h3 className="pr-10 text-sm uppercase tracking-[0.18em] text-white/55">TCAM</h3>
          <p className="mt-2 text-4xl font-semibold text-emerald-300">{formatPercent(kpis.tcam)}</p>
          <p className="mt-3 text-sm text-white/70">Taux de croissance annuel moyen de l&apos;activité.</p>
        </article>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartEBE ebe={kpis.ebe} data={monthlySeries} />
        <ChartNetResult netResult={kpis.resultat_net} data={monthlySeries} />
        <ChartTMSCV tmscv={kpis.tmscv} data={tmscvPieData} />
      </div>

      <BreakEvenChart model={breakEvenModel} />
    </section>
  );
}
