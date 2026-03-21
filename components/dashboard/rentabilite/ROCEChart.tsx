// File: components/dashboard/rentabilite/ROCEChart.tsx
// Role: visualise l'évolution mensuelle du ROCE pour suivre la performance de l'activité.
"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { InfoPopover } from "@/components/dashboard/tabs/InfoPopover";
import type { RentabilitySeriesPoint } from "@/lib/dashboard/rentabilite/rentabilityViewModel";

type ROCEChartProps = {
  data: RentabilitySeriesPoint[];
};

export function ROCEChart({ data }: ROCEChartProps) {
  return (
    <article className="precision-card relative rounded-2xl p-5">
      {/* Graphique ROCE: met en évidence la performance opérationnelle sur la période. */}
      <InfoPopover
        title="Évolution ROCE"
        purpose="Suivre la performance économique réelle de l'activité dans le temps."
        displayedData="Une courbe mensuelle du ROCE (%)."
        formula="Chaque point représente le ROCE sur la période mensuelle."
      />

      <h3 className="pr-10 text-4xl font-semibold text-white">ROCE</h3>
      <p className="mt-1 text-sm text-white/60">Évolution de la performance de l&apos;activité</p>

      <div className="mt-4 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 12, left: 6, bottom: 8 }}>
            <CartesianGrid stroke="#2d2f36" strokeDasharray="4 4" />
            <XAxis dataKey="month" stroke="#a1a1aa" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
            <YAxis stroke="#a1a1aa" tick={{ fill: "#a1a1aa", fontSize: 11 }} tickFormatter={formatPercentTick} />
            <Tooltip
              contentStyle={{ backgroundColor: "#111216", border: "1px solid #2a2a30", borderRadius: "10px" }}
              formatter={(value) => `${Number(value ?? 0).toFixed(2)}%`}
            />
            <Area type="monotone" dataKey="value" stroke="#60a5fa" fill="#60a5fa" fillOpacity={0.28} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

function formatPercentTick(value: number | string): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return "0%";
  }
  return `${parsed.toFixed(0)}%`;
}

