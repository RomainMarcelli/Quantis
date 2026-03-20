// File: components/dashboard/tabs/ChartEBE.tsx
// Role: affiche la rentabilité opérationnelle (EBE) en valeur et en tendance.
"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency } from "@/components/dashboard/formatting";
import { InfoPopover } from "@/components/dashboard/tabs/InfoPopover";
import type { ValueCreationMonthlyPoint } from "@/lib/dashboard/tabs/valueCreationData";

type ChartEBEProps = {
  ebe: number | null;
  data: ValueCreationMonthlyPoint[];
};

export function ChartEBE({ ebe, data }: ChartEBEProps) {
  return (
    <article className="precision-card relative rounded-2xl p-5">
      {/* Info contextuelle: explicite le périmètre de l'EBE pour un utilisateur non financier. */}
      <InfoPopover
        title="Rentabilité opérationnelle (EBE)"
        purpose="Mesurer ce que l'activité génère avant éléments financiers, fiscaux et exceptionnels."
        displayedData="La valeur EBE courante et son évolution sur l'année."
        formula="EBE = produits d'exploitation - charges d'exploitation (hors amortissements/provisions)."
      />

      {/* EBE: mesure la performance du cœur d'exploitation avant élément financier/fiscal. */}
      <h3 className="pr-10 text-sm uppercase tracking-[0.18em] text-white/55">Rentabilité opérationnelle (EBE)</h3>
      <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(ebe)}</p>
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
            <Bar dataKey="ebe" fill="#4f6fb8" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}
