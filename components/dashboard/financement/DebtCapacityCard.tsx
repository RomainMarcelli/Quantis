// File: components/dashboard/financement/DebtCapacityCard.tsx
// Role: affiche la capacité de remboursement et son niveau de risque financier associé.
"use client";

import { InfoPopover } from "@/components/dashboard/tabs/InfoPopover";
import { interpretDebtCapacity, severityClass } from "@/lib/dashboard/financement/financingViewModel";

type DebtCapacityCardProps = {
  debtCapacityYears: number | null;
};

export function DebtCapacityCard({ debtCapacityYears }: DebtCapacityCardProps) {
  // Interprétation métier: transforme la valeur brute (années) en statut compréhensible.
  const interpretation = interpretDebtCapacity(debtCapacityYears);

  return (
    <article className="precision-card relative rounded-2xl p-5">
      {/* Capacité de remboursement: nombre d'années théoriques pour absorber l'endettement. */}
      <InfoPopover
        title="Capacité de remboursement"
        purpose="Évaluer combien d&apos;années l&apos;entreprise mettrait à rembourser ses dettes."
        displayedData="Une durée en années + un niveau de risque synthétique."
        formula="Capacité = endettement net / capacité annuelle de remboursement."
      />

      {/* Titre compact pour rester sur une seule ligne selon la largeur disponible. */}
      <h3
        title="Capacité de remboursement"
        className="truncate pr-10 text-lg font-semibold leading-tight text-white sm:text-xl xl:text-2xl"
      >
        Capacité de remboursement
      </h3>
      <p className="mt-1 text-xs text-white/60">Horizon estimé de désendettement</p>
      <p className="mt-5 text-5xl font-semibold text-emerald-300">{formatYears(debtCapacityYears)}</p>

      <p className={`mt-4 rounded-lg border px-3 py-2 text-sm ${severityClass(interpretation.severity)}`}>
        <span className="font-semibold">{interpretation.label}</span> · {interpretation.helper}
      </p>
    </article>
  );
}

function formatYears(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return "N/D";
  }
  return `${value.toFixed(1)} ans`;
}
