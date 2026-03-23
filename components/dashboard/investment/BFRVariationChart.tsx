// File: components/dashboard/investment/BFRVariationChart.tsx
// Role: visualise l'évolution mensuelle du BFR pour identifier les phases de tension ou relâchement de cash immobilisé.
"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { InfoPopover } from "@/components/dashboard/tabs/InfoPopover";
import type { BfrVariationPoint } from "@/lib/dashboard/investment/investmentViewModel";

type BFRVariationChartProps = {
  data: BfrVariationPoint[];
};

export function BFRVariationChart({ data }: BFRVariationChartProps) {
  const first = data[0]?.value ?? 0;
  const last = data[data.length - 1]?.value ?? 0;
  const trendSymbol = last >= first ? "▲" : "▼";

  return (
    <article className="precision-card relative rounded-2xl p-5">
      {/* La variation BFR sert à détecter les dérives de besoin de financement court terme. */}
      <InfoPopover
        title="Variation du BFR"
        purpose="Suivre la trajectoire mensuelle du besoin de trésorerie immobilisée."
        displayedData="Une courbe d'évolution du BFR par mois."
        formula="Variation = BFR mois N - BFR mois N-1."
      />

      <div className="flex items-start justify-between gap-3 pr-10">
        <h3 className="text-3xl font-semibold text-white">Variation du BFR</h3>
        <p className="pt-1 text-4xl font-semibold text-emerald-300">{trendSymbol}</p>
      </div>

      <div className="mt-4 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 18, left: 4, bottom: 10 }}>
            <CartesianGrid stroke="#2d2f36" strokeDasharray="4 4" />
            <XAxis dataKey="month" stroke="#a1a1aa" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
            <YAxis
              stroke="#a1a1aa"
              tick={{ fill: "#a1a1aa", fontSize: 11 }}
              tickFormatter={(value) => `${Math.round(Number(value ?? 0) / 1000)}k€`}
            />
            <Tooltip
              contentStyle={{ backgroundColor: "#111216", border: "1px solid #2a2a30", borderRadius: "10px" }}
              formatter={(value) => `${Math.round(Number(value ?? 0)).toLocaleString("fr-FR")} €`}
            />
            <Bar dataKey="value" fill="#5d74b9" radius={[6, 6, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}
