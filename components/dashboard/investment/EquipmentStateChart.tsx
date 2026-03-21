// File: components/dashboard/investment/EquipmentStateChart.tsx
// Role: affiche l'état du matériel via un radial chart pour estimer le niveau de vieillissement des actifs.
"use client";

import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { InfoPopover } from "@/components/dashboard/tabs/InfoPopover";

type EquipmentStateChartProps = {
  equipmentState: number;
};

export function EquipmentStateChart({ equipmentState }: EquipmentStateChartProps) {
  const data = [
    { name: "État actuel", value: equipmentState, color: "#2dd4bf" },
    // Couleur renforcée pour rendre la part "usure" visible sur fond sombre.
    { name: "Usure estimée", value: 100 - equipmentState, color: "#f59e0b" }
  ];

  // Le survol d'un segment met en évidence sa définition métier dans la légende.
  const [activeSegmentName, setActiveSegmentName] = useState<string | null>(null);

  const highlightedSegment = data.find((segment) => segment.name === activeSegmentName) ?? data[0];

  return (
    <article className="precision-card relative h-full min-h-[230px] rounded-2xl p-5">
      {/* État matériel: indicateur synthétique pour évaluer le risque de vétusté des actifs. */}
      <InfoPopover
        title="État du matériel"
        purpose="Visualiser rapidement si le parc matériel est plutôt récent ou vieillissant, pour anticiper les besoins de renouvellement."
        displayedData="Le bloc affiche 2 parts: État actuel (part des actifs encore performants) et Usure estimée (part des actifs proches du renouvellement), avec leur pourcentage."
        formula="Indice matériel (%) = Actif immobilisé net / Actif immobilisé brut × 100. Repères: >70% = parc plutôt récent, 40-70% = à surveiller, <40% = parc vieillissant."
      />

      <h3 className="pr-10 text-xl font-semibold text-white sm:text-2xl">État du matériel</h3>
      <p className="mt-1 text-xs text-white/60">Ratio actif immo. net</p>
      <div className="mt-2 flex items-end justify-between gap-4">
        <p className="text-4xl font-semibold text-emerald-300">{equipmentState.toFixed(0)}%</p>
        <p className="text-xs text-white/60">Proche de 100% = matériel récent</p>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[1.1fr_0.9fr]">
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={36}
                outerRadius={62}
                onMouseLeave={() => setActiveSegmentName(null)}
              >
                {data.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={entry.color}
                    fillOpacity={activeSegmentName && activeSegmentName !== entry.name ? 0.35 : 1}
                    onMouseEnter={() => setActiveSegmentName(entry.name)}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: "#111216", border: "1px solid #2a2a30", borderRadius: "10px" }}
                formatter={(value) => `${Number(value ?? 0).toFixed(1)}%`}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Légende métier: chaque ligne explique le sens de la donnée et sa part. */}
        <div className="space-y-2">
          {data.map((segment) => (
            <div
              key={segment.name}
              className={`rounded-lg border px-3 py-2 text-xs transition ${
                highlightedSegment.name === segment.name
                  ? "border-white/25 bg-white/10 text-white"
                  : "border-white/10 bg-black/20 text-white/75"
              }`}
            >
              <p className="flex items-center gap-2 font-semibold">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
                {segment.name}
              </p>
              <p className="mt-1 text-[11px]">
                {segment.name === "État actuel"
                  ? "Part du parc jugée récente et opérationnelle."
                  : "Part estimée en usure ou nécessitant renouvellement."}
              </p>
              {/* La couleur de valeur suit le segment pour renforcer la lisibilité de la légende. */}
              <p className="mt-1 font-semibold" style={{ color: segment.color }}>
                {segment.value.toFixed(1)}%
              </p>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}
