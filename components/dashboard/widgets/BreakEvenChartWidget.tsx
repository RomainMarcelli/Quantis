// File: components/dashboard/widgets/BreakEvenChartWidget.tsx
// Role: wrapper widget pour le graphique de point mort. Construit le modèle
// BreakEvenModel à partir des données mappées et délègue le rendu à
// BreakEvenChart (utilisé historiquement en bloc inline dans ValueCreationTest).
"use client";

import { useMemo } from "react";
import { BreakEvenChart } from "@/components/dashboard/navigation/BreakEvenChart";
import { buildBreakEvenModel } from "@/lib/dashboard/tabs/valueCreationData";
import { useTheme } from "@/hooks/useTheme";
import type { MappedFinancialData } from "@/types/analysis";

type Props = {
  mappedData: MappedFinancialData | null;
};

export function BreakEvenChartWidget({ mappedData }: Props) {
  const { isDark } = useTheme();

  // Modèle calculé une seule fois par changement de mappedData. Sans
  // mappedData (analyse brute incomplète) on retombe sur un objet "vide"
  // que BreakEvenChart sait afficher en placeholder.
  const model = useMemo(
    () => (mappedData ? buildBreakEvenModel(mappedData) : null),
    [mappedData],
  );

  if (!model) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center text-xs text-white/55">
        Données comptables insuffisantes pour calculer le seuil de rentabilité.
      </div>
    );
  }

  return (
    <article className="precision-card group flex h-full flex-col rounded-2xl p-6">
      <div className="card-header mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Seuil de rentabilité</h3>
          <p className="mt-1 text-[10px] font-mono uppercase text-white/45">
            Analyse du point mort
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[10px] uppercase text-white/60">
          <LegendDot color="#f3f4f6" label="CA" />
          <LegendDot color="rgba(255,255,255,0.46)" label="Coûts fixes" />
          <LegendDot color="#C5A059" label="Coûts totaux" />
        </div>
      </div>

      <div className="flex-1">
        <BreakEvenChart model={model} isDark={isDark} />
      </div>
    </article>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
