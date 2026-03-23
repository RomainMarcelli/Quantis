// File: components/dashboard/financement/LeverageCard.tsx
// Role: affiche le levier financier pour visualiser la dépendance aux financements externes.
"use client";

import { InfoPopover } from "@/components/dashboard/tabs/InfoPopover";
import { interpretLeverage, severityClass } from "@/lib/dashboard/financement/financingViewModel";

type LeverageCardProps = {
  leverage: number | null;
};

export function LeverageCard({ leverage }: LeverageCardProps) {
  // Le levier est interprété pour donner une lecture immédiate au non-financier.
  const interpretation = interpretLeverage(leverage);

  return (
    <article className="precision-card relative rounded-2xl p-5">
      {/* Levier financier: compare l'endettement au niveau de capitaux/ressources internes. */}
      <InfoPopover
        title="Dépendance bancaire"
        purpose="Mesurer la dépendance de l&apos;entreprise aux financements externes."
        displayedData="Le levier financier et une qualification de risque associée."
        formula="Levier = ressources externes / capitaux ou capacité interne."
      />

      {/* Titre réduit pour garder un rendu dense et lisible dans les cards financières. */}
      <h3
        title="Dépendance bancaire"
        className="truncate pr-10 text-lg font-semibold leading-tight text-white sm:text-xl xl:text-2xl"
      >
        Dépendance bancaire
      </h3>
      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-white/60">Levier financier</p>
      <p className="mt-5 text-5xl font-semibold text-white">{formatLeverage(leverage)}</p>

      <p className={`mt-4 rounded-lg border px-3 py-2 text-sm ${severityClass(interpretation.severity)}`}>
        <span className="font-semibold">{interpretation.label}</span> · {interpretation.helper}
      </p>
    </article>
  );
}

function formatLeverage(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return "N/D";
  }
  return `x${value.toFixed(2)}`;
}
