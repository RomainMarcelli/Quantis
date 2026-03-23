// File: components/dashboard/tabs/ChartRevenue.tsx
// Role: affiche l'évolution mensuelle du chiffre d'affaires (CA) dans la section Création de valeur.
"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency } from "@/components/dashboard/formatting";
import { InfoPopover } from "@/components/dashboard/tabs/InfoPopover";
import type { ValueCreationMonthlyPoint } from "@/lib/dashboard/tabs/valueCreationData";

type ChartRevenueProps = {
  ca: number | null;
  data: ValueCreationMonthlyPoint[];
};

export function ChartRevenue({ ca, data }: ChartRevenueProps) {
  return (
    <article className="precision-card relative rounded-2xl p-5">
      {/* Info contextuelle: permet à l'utilisateur de comprendre rapidement le rôle métier du bloc. */}
      <InfoPopover
        title="Chiffre d'affaires"
        purpose="Suivre la dynamique commerciale de l'entreprise et son niveau de ventes."
        displayedData="Le total du chiffre d'affaires et une évolution mensuelle projetée."
        formula="CA = somme des ventes de biens et services sur la période sélectionnée."
      />

      {/* KPI clé: CA annuel + lecture de tendance mensuelle pour contextualiser la dynamique commerciale. */}
      <h3 className="pr-10 text-sm uppercase tracking-[0.18em] text-white/55">Chiffre d&apos;affaires</h3>
      <p className="mt-2 text-3xl font-semibold text-white">{formatCurrency(ca)}</p>
      <div className="mt-4 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="month" stroke="#a1a1aa" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
            <YAxis stroke="#a1a1aa" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
            <Tooltip
              contentStyle={{ backgroundColor: "#111216", border: "1px solid #2a2a30", borderRadius: "10px" }}
              formatter={(value) => formatCurrency(Number(value ?? 0))}
              labelStyle={{ color: "#f4f4f5" }}
            />
            <Bar dataKey="revenue" fill="#4f6fb8" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}
