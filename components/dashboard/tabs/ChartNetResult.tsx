// File: components/dashboard/tabs/ChartNetResult.tsx
// Role: affiche le résultat net en valeur et son évolution mensuelle.
"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency } from "@/components/dashboard/formatting";
import { InfoPopover } from "@/components/dashboard/tabs/InfoPopover";
import type { ValueCreationMonthlyPoint } from "@/lib/dashboard/tabs/valueCreationData";

type ChartNetResultProps = {
  netResult: number | null;
  data: ValueCreationMonthlyPoint[];
};

export function ChartNetResult({ netResult, data }: ChartNetResultProps) {
  return (
    <article className="precision-card relative rounded-2xl p-5">
      {/* Info contextuelle: évite les confusions entre résultat net et EBE. */}
      <InfoPopover
        title="Résultat net"
        purpose="Visualiser le profit final réellement conservé après toutes les charges."
        displayedData="Le résultat net courant et sa tendance mensuelle."
        formula="Résultat net = produits totaux - charges totales (exploitation, financières, exceptionnelles, impôts)."
      />

      {/* Résultat net: profit final après charges financières, exceptionnelles et impôts. */}
      <h3 className="pr-10 text-sm uppercase tracking-[0.18em] text-white/55">Résultat net</h3>
      <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(netResult)}</p>
      <div className="mt-4 h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="month" stroke="#a1a1aa" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
            <YAxis stroke="#a1a1aa" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
            <Tooltip
              contentStyle={{ backgroundColor: "#111216", border: "1px solid #2a2a30", borderRadius: "10px" }}
              formatter={(value) => formatCurrency(Number(value ?? 0))}
              labelStyle={{ color: "#f4f4f5" }}
            />
            <Bar dataKey="netResult" fill="#4f6fb8" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}
