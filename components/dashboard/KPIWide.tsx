// File: components/dashboard/KPIWide.tsx
// Role: rend la carte KPI large (EBE) avec jauge de progression vers un objectif configurable.
"use client";

import { Target } from "lucide-react";
import { computeEbeProgressPercent } from "@/lib/dashboard/premiumDashboardAdapter";
import { formatCurrency } from "@/components/dashboard/formatting";
import { useAnimatedNumber } from "@/components/dashboard/useAnimatedNumber";

type KPIWideProps = {
  title: string;
  tag: string;
  value: number | null;
  target?: number;
  searchId?: string;
};

export function KPIWide({ title, tag, value, target = 50000, searchId }: KPIWideProps) {
  // Animation de la valeur EBE.
  const animatedValue = useAnimatedNumber(value, { durationMs: 1200 });
  // Animation de la barre de progression vers l'objectif.
  const progressTarget = computeEbeProgressPercent(value, target);
  const animatedProgress = useAnimatedNumber(progressTarget, { durationMs: 1000 });

  return (
    <article className="precision-card group fade-up flex flex-col rounded-2xl p-6 md:col-span-2" data-search-id={searchId}>
      <div className="card-header mb-6 flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <span className="tech-tag self-start text-[10px] font-mono uppercase text-white/60">{tag}</span>
      </div>

      <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
        <div className="w-full flex-1">
          <div className="tnum data-react text-5xl font-semibold tracking-tight text-white">
            {value === null ? "N/D" : formatCurrency(animatedValue)}
          </div>
        </div>

        <div className="w-full rounded-lg border border-white/5 bg-quantis-base p-5 transition-all duration-500 group-hover:border-quantis-gold/30 md:w-1/2">
          <div className="mb-3 flex items-end justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-3.5 w-3.5 text-quantis-muted" />
              <span className="text-[11px] font-medium uppercase text-quantis-muted">
                Objectif {formatCurrency(target)}
              </span>
            </div>
            <span className="tnum text-sm font-bold text-white">{Math.round(animatedProgress)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-none border border-white/10 bg-white/5">
            <div
              className="h-full bg-quantis-gold transition-all duration-300"
              style={{ width: `${animatedProgress}%` }}
            />
          </div>
        </div>
      </div>

      <p className="edu-text">
        L&apos;EBE mesure la performance opérationnelle pure de l&apos;entreprise, indépendamment de la structure
        financière.
      </p>
    </article>
  );
}
