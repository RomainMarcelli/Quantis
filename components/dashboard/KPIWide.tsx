// File: components/dashboard/KPIWide.tsx
// Role: carte KPI large du cockpit (ex. EBE) — même layout que KPIBlock
// avec un slot supplémentaire pour la jauge "objectif".
//
// La jauge de progression vers l'objectif est rendue via le slot `extra`
// du KpiCardLayout, donc en dessous du badge de statut (s'il s'affiche).
"use client";

import { Target } from "lucide-react";
import { computeEbeProgressPercent } from "@/lib/dashboard/premiumDashboardAdapter";
import { formatCurrency, INSUFFICIENT_DATA_LABEL } from "@/components/dashboard/formatting";
import { useAnimatedNumber } from "@/components/dashboard/useAnimatedNumber";
import { KpiCardLayout } from "@/components/kpi/KpiCardLayout";

type KPIWideProps = {
  /** Titre vulgarisé (ex. "Ce qu'il reste vraiment"). */
  title: string;
  /** Nom officiel (ex. "Excédent brut d'exploitation") — uppercase ligne 1. */
  tag: string;
  value: number | null;
  /** Objectif EBE pour la jauge — défaut 50 000 €. */
  target?: number;
  /** Valeur du même KPI sur la période précédente, fournie par le parent. */
  previousValue?: number | null;
  searchId?: string;
  kpiId?: string;
};

export function KPIWide({
  title,
  tag,
  value,
  target = 50000,
  previousValue,
  searchId,
  kpiId,
}: KPIWideProps) {
  // Animations indépendantes pour la valeur principale et la barre de progression.
  const animatedValue = useAnimatedNumber(value, { durationMs: 1200 });
  const progressTarget = computeEbeProgressPercent(value, target);
  const animatedProgress = useAnimatedNumber(progressTarget, { durationMs: 1000 });

  const gauge = (
    <div className="rounded-lg border border-white/5 bg-quantis-base p-3">
      <div className="mb-2 flex items-end justify-between">
        <div className="flex items-center gap-1.5">
          <Target className="h-3 w-3 text-quantis-muted" />
          <span className="text-[10px] font-medium uppercase text-quantis-muted">
            Objectif {formatCurrency(target)}
          </span>
        </div>
        <span className="tnum text-xs font-bold text-white">
          {Math.round(animatedProgress)}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-none border border-white/10 bg-white/5">
        <div
          className="h-full bg-quantis-gold transition-all duration-300"
          style={{ width: `${animatedProgress}%` }}
        />
      </div>
    </div>
  );

  return (
    <KpiCardLayout
      kpiId={kpiId}
      fullName={tag}
      title={title}
      value={value}
      previousValue={previousValue}
      formattedValue={
        value === null ? INSUFFICIENT_DATA_LABEL : formatCurrency(animatedValue)
      }
      extra={gauge}
      searchId={searchId}
      className="md:col-span-2"
    />
  );
}
