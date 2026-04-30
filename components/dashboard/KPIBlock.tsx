// File: components/dashboard/KPIBlock.tsx
// Role: rend une carte KPI standard (valeur principale + variation/runway) dans la grille premium.
"use client";

import type { ReactNode } from "react";
import { Clock, TrendingUp } from "lucide-react";
import {
  formatCurrency,
  formatMonths,
  formatPercent,
  INSUFFICIENT_DATA_LABEL,
} from "@/components/dashboard/formatting";
import { useAnimatedNumber } from "@/components/dashboard/useAnimatedNumber";
import { KpiTooltip } from "@/components/kpi/KpiTooltip";

type KPIBlockFormat = "currency" | "percent";

type KPIBlockProps = {
  title: string;
  tag: string;
  value: number | null;
  format: KPIBlockFormat;
  /**
   * Icône de catégorie — laissée dans la signature pour compatibilité avec
   * les call-sites existants, mais plus rendue dans la card pour
   * simplifier visuellement (l'icône ✨ du KpiTooltip suffit).
   */
  icon?: ReactNode;
  trendValue?: number | null;
  /**
   * Libellé "vs période précédente" — supprimé du rendu mais conservé
   * dans la signature. La phrase explicative est désormais portée
   * intégralement par le KpiTooltip.
   */
  trendLabel?: string;
  sideLabel?: string;
  searchId?: string;
  /** id du KPI dans le registre — déclenche l'affichage du KpiTooltip. */
  kpiId?: string;
};

export function KPIBlock({
  title,
  tag,
  value,
  format,
  trendValue,
  sideLabel,
  searchId,
  kpiId
}: KPIBlockProps) {
  // Le compteur anime uniquement la valeur principale de la carte.
  const animatedValue = useAnimatedNumber(value, { durationMs: 1200 });

  return (
    <article className="precision-card group fade-up flex flex-col justify-between rounded-2xl p-6" data-search-id={searchId}>
      <div>
        <div className="card-header flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-white">{title}</h3>
            <span className="tech-tag self-start text-[10px] font-mono uppercase text-white/60">{tag}</span>
          </div>
          {/* Tooltip ✨ seul à droite — la cellule est volontairement compacte
              maintenant que l'explication détaillée vit dans le tooltip. */}
          {kpiId ? <KpiTooltip kpiId={kpiId} value={value} /> : null}
        </div>

        <div>
          <div className="tnum data-react text-[2.5rem] font-medium leading-none tracking-tight text-white">
            {formatKpiValue(animatedValue, value, format)}
          </div>
          {/* Footer : badge tendance OU label de fallback. Le petit libellé
              "vs période précédente" qui flottait à droite a été retiré —
              le KpiTooltip explique le contexte si besoin. */}
          <div className="mt-5 flex items-center">
            {trendValue !== undefined ? (
              <div className="interactive-badge flex items-center gap-2 rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-1">
                <TrendingUp className="h-3 w-3 text-emerald-500" />
                <span className="text-[11px] font-bold text-emerald-500">{formatPercent(trendValue)}</span>
              </div>
            ) : (
              <div className="interactive-badge tech-tag flex items-center gap-2 border-none bg-transparent">
                <Clock className="h-3 w-3 text-white/50" />
                <span className="text-[11px] font-medium text-white/70">{sideLabel ?? INSUFFICIENT_DATA_LABEL}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function formatKpiValue(
  animatedValue: number,
  originalValue: number | null,
  format: KPIBlockFormat
): string {
  if (originalValue === null) {
    return INSUFFICIENT_DATA_LABEL;
  }

  if (format === "currency") {
    return formatCurrency(animatedValue);
  }

  return formatPercent(animatedValue);
}

// Helper expose pour d'autres cartes qui souhaitent afficher un runway en lecture directe.
export function formatRunwayLabel(value: number | null): string {
  return formatMonths(value);
}
