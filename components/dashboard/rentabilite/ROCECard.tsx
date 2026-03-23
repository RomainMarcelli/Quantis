// File: components/dashboard/rentabilite/ROCECard.tsx
// Role: affiche le KPI ROCE pour évaluer la performance économique de l'activité.
"use client";

import { formatPercent } from "@/components/dashboard/formatting";
import { InfoPopover } from "@/components/dashboard/tabs/InfoPopover";
import type { RentabilityTrend } from "@/lib/dashboard/rentabilite/rentabilityViewModel";
import { trendClass } from "@/lib/dashboard/rentabilite/rentabilityViewModel";

type ROCECardProps = {
  roce: number | null;
  trend: RentabilityTrend;
};

export function ROCECard({ roce, trend }: ROCECardProps) {
  return (
    <article className="precision-card relative rounded-2xl p-5">
      {/* ROCE: performance de l'actif économique mobilisé par l'entreprise. */}
      <InfoPopover
        title="Performance de l'activité (ROCE)"
        purpose="Mesurer la rentabilité des capitaux engagés dans l'exploitation."
        displayedData="Le ROCE en pourcentage avec une tendance de période."
        formula="ROCE = résultat opérationnel / capitaux engagés × 100."
      />

      <h3 className="pr-10 text-4xl font-semibold text-white">Performance de l&apos;activité</h3>
      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-white/60">ROCE</p>
      <p className="mt-5 text-5xl font-semibold text-emerald-300">{formatPercent(roce, 1)}</p>

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

