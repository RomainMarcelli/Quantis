// File: components/dashboard/investment/ClientsVsFournisseurs.tsx
// Role: compare DSO (clients) et DPO (fournisseurs) pour qualifier le risque de décalage de trésorerie.
"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { InfoPopover } from "@/components/dashboard/tabs/InfoPopover";
import type { ClientsVsSuppliersComparison } from "@/lib/dashboard/investment/investmentViewModel";

type ClientsVsFournisseursProps = {
  dso: number | null;
  dpo: number | null;
  comparison: ClientsVsSuppliersComparison;
};

export function ClientsVsFournisseurs({ dso, dpo, comparison }: ClientsVsFournisseursProps) {
  const deltaLabel =
    comparison.deltaDays === null ? "N/D" : `${comparison.deltaDays > 0 ? "+" : ""}${Math.round(comparison.deltaDays)} j`;

  const data = [
    { label: "DSO", value: dso ?? 0, color: "#fb7185" },
    { label: "DPO", value: dpo ?? 0, color: "#60a5fa" }
  ];

  return (
    <article className="precision-card relative h-full min-h-[190px] rounded-2xl p-5">
      {/* DSO/DPO: comparaison clé pour savoir qui finance le cycle d'exploitation. */}
      <InfoPopover
        title="Clients vs Fournisseurs"
        purpose="Comparer les délais d'encaissement clients et de paiement fournisseurs."
        displayedData="Un comparatif DSO/DPO en jours et une interprétation de risque."
        formula="Delta délais = DSO - DPO (positif = tension, négatif = favorable)."
      />

      {/* Titre ramené sur une seule ligne pour limiter la hauteur du bloc. */}
      <h3 className="pr-10 text-xl font-semibold text-white sm:text-2xl">Clients / Fournisseurs</h3>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.14em] text-white/55">Delta DSO - DPO</p>
        <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-semibold text-white">
          {deltaLabel}
        </span>
      </div>

      <div className="mt-3 h-32">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="label" stroke="#a1a1aa" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
            <YAxis stroke="#a1a1aa" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              content={(props) => (
                <ClientsVsTooltip
                  active={props.active}
                  payload={props.payload as readonly TooltipPayload[] | undefined}
                  deltaLabel={deltaLabel}
                />
              )}
            />
            <Bar dataKey="value" radius={[8, 8, 0, 0]}>
              {data.map((entry) => (
                <Cell key={entry.label} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className={`mt-2 rounded-lg border px-3 py-2 text-sm ${statusClass(comparison.status)}`}>
        {comparison.message}
      </p>
    </article>
  );
}

type TooltipPayload = {
  value?: number | string;
  payload?: {
    label: string;
    value: number;
    color: string;
  };
};

type ClientsVsTooltipProps = {
  active?: boolean;
  payload?: readonly TooltipPayload[];
  deltaLabel: string;
};

function ClientsVsTooltip({ active, payload, deltaLabel }: ClientsVsTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const firstPoint = payload[0];
  const pointLabel = firstPoint?.payload?.label ?? "Ratio";
  const pointValue = Number(firstPoint?.value ?? 0);
  const pointColor = firstPoint?.payload?.color ?? "#e5e7eb";

  return (
    <div className="w-[220px] rounded-xl border border-[#2a2a30] bg-[#111216]/95 p-3 shadow-2xl backdrop-blur-sm">
      {/* Ligne principale: valeur exacte du ratio actuellement survolé dans le graphique. */}
      <p className="text-[11px] uppercase tracking-[0.12em] text-white/60">{pointLabel}</p>
      <p className="mt-1 text-base font-semibold" style={{ color: pointColor }}>
        {Math.round(pointValue)} jours
      </p>

      {/* Stats complémentaires: écart global clients/fournisseurs + interprétation métier instantanée. */}
      <div className="mt-2 border-t border-white/10 pt-2">
        <p className="text-xs text-white/75">
          Écart DSO-DPO: <span className="font-semibold text-white">{deltaLabel}</span>
        </p>
      </div>
    </div>
  );
}

function statusClass(status: ClientsVsSuppliersComparison["status"]): string {
  if (status === "risk") {
    return "border-rose-400/35 bg-rose-500/12 text-rose-200";
  }
  if (status === "positive") {
    return "border-emerald-400/35 bg-emerald-500/12 text-emerald-200";
  }
  if (status === "balanced") {
    return "border-amber-400/35 bg-amber-500/12 text-amber-200";
  }
  return "border-white/20 bg-white/5 text-white/75";
}
