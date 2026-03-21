// File: components/dashboard/financement/CashFlowCard.tsx
// Role: affiche le cash généré net avec un mini graphique d'évolution pour contextualiser la dynamique.
"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency } from "@/components/dashboard/formatting";
import { InfoPopover } from "@/components/dashboard/tabs/InfoPopover";
import type { CashFlowPoint } from "@/lib/dashboard/financement/financingViewModel";

type CashFlowCardProps = {
  cashFlow: number | null;
  series: CashFlowPoint[];
};

export function CashFlowCard({ cashFlow, series }: CashFlowCardProps) {
  return (
    <article className="precision-card relative rounded-2xl p-5">
      {/* Flux de trésorerie: reflète le cash effectivement dégagé par l'activité. */}
      <InfoPopover
        title="Cash généré (net)"
        purpose="Visualiser le cash réellement généré par l&apos;exploitation."
        displayedData="Valeur de flux net + mini tendance mensuelle."
        formula="Flux net d&apos;exploitation = encaissements opérationnels - décaissements opérationnels."
      />

      {/* Titre réduit pour conserver la même hiérarchie visuelle que les autres blocs Financement. */}
      <h3
        title="Cash généré (net)"
        className="truncate pr-10 text-lg font-semibold leading-tight text-white sm:text-xl xl:text-2xl"
      >
        Cash généré (net)
      </h3>
      <p className="mt-1 text-sm text-white/60">Flux de trésorerie d&apos;exploitation</p>
      <p className="mt-3 text-5xl font-semibold text-emerald-300">{formatCurrency(cashFlow)}</p>

      <div className="mt-4 h-44">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 10, right: 12, left: 6, bottom: 8 }}>
            <CartesianGrid stroke="#2d2f36" strokeDasharray="4 4" />
            <XAxis dataKey="month" stroke="#a1a1aa" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
            <YAxis stroke="#a1a1aa" tick={{ fill: "#a1a1aa", fontSize: 11 }} tickFormatter={formatAxisTick} />
            <Tooltip
              contentStyle={{ backgroundColor: "#111216", border: "1px solid #2a2a30", borderRadius: "10px" }}
              formatter={(value) => `${Math.round(Number(value ?? 0)).toLocaleString("fr-FR")} €`}
            />
            <Area type="monotone" dataKey="value" stroke="#2dd4bf" fill="#2dd4bf" fillOpacity={0.28} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

function formatAxisTick(value: number | string): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return "0";
  }
  return `${Math.round(parsed / 1000)}k€`;
}
