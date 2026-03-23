// File: components/dashboard/tabs/ChartTMSCV.tsx
// Role: visualise le TMSCV en donut avec légende explicative, y compris en cas de marge négative.
"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatPercent } from "@/components/dashboard/formatting";
import { InfoPopover } from "@/components/dashboard/tabs/InfoPopover";
import type { TmscvPieSlice } from "@/lib/dashboard/tabs/valueCreationData";

type ChartTMSCVProps = {
  tmscv: number | null;
  data: TmscvPieSlice[];
};

export function ChartTMSCV({ tmscv, data }: ChartTMSCVProps) {
  return (
    <article className="precision-card relative rounded-2xl p-5">
      {/* Info contextuelle: explique le sens métier et la formule de TMSCV. */}
      <InfoPopover
        title="TMSCV"
        purpose="Mesurer la marge générée après prise en compte des coûts variables."
        displayedData="Le TMSCV en pourcentage et la répartition visuelle marge/coûts associés."
        formula="TMSCV = (marge sur coûts variables / chiffre d'affaires) × 100."
      />

      {/* TMSCV: taux de marge sur coûts variables, utile pour juger la rentabilité de chaque vente. */}
      <h3 className="pr-10 text-sm uppercase tracking-[0.18em] text-white/55">TMSCV</h3>
      <p className="mt-2 text-2xl font-semibold text-white">{formatPercent(tmscv)}</p>

      <div className="mt-4 h-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={46} outerRadius={72} paddingAngle={2}>
              {data.map((entry, index) => (
                <Cell key={`${entry.name}-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ backgroundColor: "#111216", border: "1px solid #2a2a30", borderRadius: "10px" }}
              formatter={(_value, _name, item) => {
                const payload = (item as { payload?: TmscvPieSlice } | undefined)?.payload;
                if (!payload) {
                  return ["0%", "N/A"];
                }
                return [`${payload.actualValue.toFixed(1)}%`, payload.name];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Légende explicative: affiche la valeur réelle métier de chaque segment. */}
      <ul className="mt-3 space-y-1.5 text-xs text-white/75">
        {data.map((entry) => (
          <li key={entry.name} className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} aria-hidden="true" />
              {entry.name}
            </span>
            <span className="font-medium text-white/90">{entry.actualValue.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
