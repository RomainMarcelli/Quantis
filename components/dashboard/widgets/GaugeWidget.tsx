// File: components/dashboard/widgets/GaugeWidget.tsx
// Role: widget "jauge radiale" — visualise la position d'un KPI sur une
// échelle bornée par les seuils déclarés dans le registre. SVG custom (pas
// de lib externe).
//
// Convention de couleur :
//   - Sous danger : rouge (rose-400)
//   - Entre danger et warning : ambre
//   - Entre warning et good : vert pâle
//   - Au-dessus de good : vert (emerald)
"use client";

import { memo } from "react";
import { getKpiDefinition, type KpiThresholds, type KpiUnit } from "@/lib/kpi/kpiRegistry";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  INSUFFICIENT_DATA_LABEL
} from "@/components/dashboard/formatting";
import type { CalculatedKpis } from "@/types/analysis";

type GaugeWidgetProps = {
  kpiId: string;
  kpis: CalculatedKpis;
};

const ARC_RADIUS = 80;
const ARC_STROKE = 14;
const ARC_VIEWBOX = 200;

function GaugeWidgetImpl({ kpiId, kpis }: GaugeWidgetProps) {
  const definition = getKpiDefinition(kpiId);
  const value = readKpiValue(kpis, kpiId);
  const unit = definition?.unit ?? "ratio";
  const title = definition?.label ?? kpiId;
  const shortLabel = definition?.shortLabel ?? kpiId;

  // Si pas de seuils déclarés, on retombe sur une échelle 0-100.
  const thresholds = definition?.thresholds ?? { danger: 0, warning: 50, good: 100 };
  const min = Math.min(thresholds.danger ?? 0, value ?? 0, 0);
  const max = Math.max(thresholds.good ?? 100, value ?? 100, 100);

  const ratio = value !== null && Number.isFinite(value) ? clamp((value - min) / (max - min), 0, 1) : null;
  const angle = ratio !== null ? 180 * ratio : 0; // demi-cercle 0-180°
  const color = pickGaugeColor(value, thresholds);

  const cx = ARC_VIEWBOX / 2;
  const cy = ARC_VIEWBOX / 2 + 20;

  return (
    <article className="precision-card fade-up flex h-full flex-col items-center justify-between rounded-2xl p-5">
      <header className="mb-2 w-full">
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/45">
          Jauge · {shortLabel}
        </span>
        <h3 className="text-base font-semibold text-white">{title}</h3>
      </header>

      <div className="relative">
        <svg viewBox={`0 0 ${ARC_VIEWBOX} ${cy + 10}`} className="h-[140px] w-[200px]">
          {/* Arc de fond */}
          <path
            d={describeArc(cx, cy, ARC_RADIUS, -180, 0)}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={ARC_STROKE}
            strokeLinecap="round"
          />
          {/* Arc rempli (position du KPI) */}
          {ratio !== null ? (
            <path
              d={describeArc(cx, cy, ARC_RADIUS, -180, -180 + angle)}
              fill="none"
              stroke={color}
              strokeWidth={ARC_STROKE}
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 6px ${color}aa)` }}
            />
          ) : null}
        </svg>

        <div className="absolute inset-x-0 top-1/2 flex flex-col items-center text-center">
          <span className="tnum text-2xl font-semibold text-white">
            {formatGaugeValue(value, unit)}
          </span>
        </div>
      </div>

      <div className="mt-3 flex w-full items-center justify-between text-[10px] font-mono uppercase text-white/45">
        <span>{formatGaugeValue(min, unit)}</span>
        <span>{formatGaugeValue(max, unit)}</span>
      </div>
    </article>
  );
}

function readKpiValue(kpis: CalculatedKpis | null | undefined, kpiId: string): number | null {
  if (!kpis) return null;
  const value = (kpis as unknown as Record<string, number | null | undefined>)[kpiId];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

function pickGaugeColor(value: number | null, thresholds: KpiThresholds): string {
  if (value === null) return "rgba(255,255,255,0.3)";
  if (thresholds.good !== undefined && value >= thresholds.good) return "#10B981"; // emerald
  if (thresholds.warning !== undefined && value >= thresholds.warning) return "#FBBF24"; // amber
  if (thresholds.danger !== undefined && value >= thresholds.danger) return "#FB923C"; // orange
  return "#FB7185"; // rose
}

function formatGaugeValue(value: number | null, unit: KpiUnit): string {
  if (value === null || !Number.isFinite(value)) return INSUFFICIENT_DATA_LABEL;
  if (unit === "currency") return formatCurrency(value);
  if (unit === "percent") return formatPercent(value);
  if (unit === "days") return `${formatNumber(value, 0)} j`;
  if (unit === "ratio" || unit === "score") return formatNumber(value, 2);
  return formatNumber(value);
}

// Helpers SVG pour décrire un arc circulaire.
function polarToCartesian(cx: number, cy: number, radius: number, angleDeg: number): { x: number; y: number } {
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad)
  };
}

function describeArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

export const GaugeWidget = memo(GaugeWidgetImpl);
