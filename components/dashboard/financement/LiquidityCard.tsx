// File: components/dashboard/financement/LiquidityCard.tsx
// Role: affiche les trois ratios de liquidité pour mesurer la sécurité financière à court terme.
"use client";

import { InfoPopover } from "@/components/dashboard/tabs/InfoPopover";
import type { FinancingIndicator } from "@/lib/dashboard/financement/financingViewModel";
import { severityClass } from "@/lib/dashboard/financement/financingViewModel";

type LiquidityCardProps = {
  indicators: FinancingIndicator[];
};

export function LiquidityCard({ indicators }: LiquidityCardProps) {
  return (
    <article className="precision-card relative rounded-2xl p-5">
      {/* Ratios de liquidité: permettent de vérifier la capacité à honorer les dettes court terme. */}
      <InfoPopover
        title="Sécurité"
        purpose="Mesurer la robustesse de trésorerie à court terme via trois ratios de liquidité."
        displayedData="Liquidité générale, réduite et immédiate, chacune avec un statut visuel."
        formula="Comparaison des actifs mobilisables versus dettes exigibles à court terme."
      />

      {/* Titre volontairement réduit pour harmoniser l'échelle visuelle de la section Financement. */}
      <h3
        title="Sécurité"
        className="truncate pr-10 text-lg font-semibold leading-tight text-white sm:text-xl xl:text-2xl"
      >
        Sécurité
      </h3>
      <p className="mt-1 text-xs text-white/60">Ratio de liquidité</p>

      <div className="mt-5 grid gap-2 md:grid-cols-3">
        {indicators.map((indicator) => (
          <div key={indicator.label} className={`rounded-xl border px-3 py-3 ${severityClass(indicator.severity)}`}>
            <p className="text-lg font-semibold">{indicator.label}</p>
            <p className="mt-1 text-2xl font-semibold">{formatRatio(indicator.value)}</p>
            <p className="mt-1 text-[11px] opacity-90">{indicator.helper}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

function formatRatio(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return "N/D";
  }
  return value.toFixed(2);
}
