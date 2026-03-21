// File: components/dashboard/rentabilite/ROEChart.tsx
// Role: visualise l'évolution mensuelle du ROE pour contextualiser le niveau actuel.
"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { InfoPopover } from "@/components/dashboard/tabs/InfoPopover";
import type { RentabilitySeriesPoint } from "@/lib/dashboard/rentabilite/rentabilityViewModel";

type ROEChartProps = {
  data: RentabilitySeriesPoint[];
};

export function ROEChart({ data }: ROEChartProps) {
  return (
    <article className="precision-card relative rounded-2xl p-5">
      {/* Graphique ROE: aide à voir la stabilité ou la dégradation de la rentabilité du capital. */}
      <InfoPopover
        title="Évolution ROE"
        purpose="Suivre la dynamique de rentabilité des capitaux propres sur la période."
        displayedData="Une série mensuelle du ROE (%)."
        formula="Chaque barre représente le ROE du mois concerné."
      />

      <h3 className="pr-10 text-4xl font-semibold text-white">ROE</h3>
      <p className="mt-1 text-sm text-white/60">Évolution de la rentabilité du capital</p>

      <div className="mt-4 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 12, left: 6, bottom: 8 }}>
            <CartesianGrid stroke="#2d2f36" strokeDasharray="4 4" />
            <XAxis dataKey="month" stroke="#a1a1aa" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
            <YAxis stroke="#a1a1aa" tick={{ fill: "#a1a1aa", fontSize: 11 }} tickFormatter={formatPercentTick} />
            <Tooltip
              contentStyle={{ backgroundColor: "#111216", border: "1px solid #2a2a30", borderRadius: "10px" }}
              formatter={(value) => `${Number(value ?? 0).toFixed(2)}%`}
            />
            <Bar dataKey="value" fill="#5f7fd0" radius={[4, 4, 0, 0]} />
          </BarChart>
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

