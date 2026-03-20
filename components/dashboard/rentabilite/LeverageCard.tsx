// File: components/dashboard/rentabilite/LeverageCard.tsx
// Role: présente le levier financier et son interprétation pour visualiser la dépendance bancaire.
"use client";

import { InfoPopover } from "@/components/dashboard/tabs/InfoPopover";
import type { LeverageInterpretation } from "@/lib/dashboard/rentabilite/rentabilityViewModel";
import { leverageClass } from "@/lib/dashboard/rentabilite/rentabilityViewModel";

type LeverageCardProps = {
  leverage: number | null;
  interpretation: LeverageInterpretation;
};

export function LeverageCard({ leverage, interpretation }: LeverageCardProps) {
  return (
    <article className="precision-card relative rounded-2xl p-5">
      {/* Levier financier: indique le niveau de dépendance de la rentabilité au financement externe. */}
      <InfoPopover
        title="Dépendance bancaire"
        purpose="Évaluer l'exposition de l'entreprise au financement externe."
        displayedData="Le levier financier en multiple (x) et un statut de risque."
        formula="Levier financier = ressources externes / ressources internes."
      />

      <h3 className="pr-10 text-4xl font-semibold text-white">Dépendance bancaire</h3>
      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-white/60">Levier financier</p>
      <p className="mt-5 text-5xl font-semibold text-white">{formatLeverage(leverage)}</p>

      <div className={`mt-4 rounded-lg border px-3 py-2 text-sm ${leverageClass(interpretation.status)}`}>
        <p className="font-semibold">{interpretation.label}</p>
        <p className="mt-1">{interpretation.helper}</p>
      </div>
    </article>
  );
}

function formatLeverage(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return "N/D";
  }
  return `x${value.toFixed(2)}`;
}

