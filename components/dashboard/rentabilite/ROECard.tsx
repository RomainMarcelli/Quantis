// File: components/dashboard/rentabilite/ROECard.tsx
// Role: affiche le KPI ROE en lecture "gain sur mon capital" avec un indicateur visuel de tendance.
"use client";

import { formatPercent } from "@/components/dashboard/formatting";
import { InfoPopover } from "@/components/dashboard/tabs/InfoPopover";
import type { RentabilityTrend } from "@/lib/dashboard/rentabilite/rentabilityViewModel";
import { trendClass } from "@/lib/dashboard/rentabilite/rentabilityViewModel";

type ROECardProps = {
  roe: number | null;
  trend: RentabilityTrend;
};

export function ROECard({ roe, trend }: ROECardProps) {
  return (
    <article className="precision-card relative rounded-2xl p-5">
      {/* ROE: indicateur clé du rendement des capitaux propres pour l'actionnaire. */}
      <InfoPopover
        title="Gain sur mon capital (ROE)"
        purpose="Mesurer la rentabilité des capitaux investis par les associés."
        displayedData="Le ROE en pourcentage et sa tendance récente."
        formula="ROE = résultat net / capitaux propres × 100."
      />

      <h3 className="pr-10 text-4xl font-semibold text-white">Gain sur mon capital</h3>
      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-white/60">ROE</p>
      <p className="mt-5 text-5xl font-semibold text-emerald-300">{formatPercent(roe, 1)}</p>

      <div className={`mt-4 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${trendClass(trend.direction)}`}>
        <span className="text-base" aria-hidden>
          {trendIcon(trend.direction)}
        </span>
        <span className="font-medium">{trend.label}</span>
      </div>
    </article>
  );
}

function trendIcon(direction: RentabilityTrend["direction"]): string {
  if (direction === "up") {
    return "▲";
  }
  if (direction === "down") {
    return "▼";
  }
  if (direction === "flat") {
    return "■";
  }
  return "•";
}

