// File: components/dashboard/widgets/RoeRoceChartWidget.tsx
// Role: widget "Analyse de la création de valeur" — chart comparatif ROE vs
// ROCE avec écart effet de levier visualisé en aire colorée. SVG custom
// (pas Recharts) repris du bloc inline historique de RentabilityTest.
"use client";

import { useMemo } from "react";
import { formatNumber } from "@/components/dashboard/formatting";
import {
  buildRentabilitySeries, normalizePercentInput,
} from "@/lib/dashboard/rentabilite/rentabilityViewModel";
import { useTheme } from "@/hooks/useTheme";
import type { CalculatedKpis } from "@/types/analysis";

type ChartPoint = {
  label: string;
  roe: number;
  roce: number;
};

type Props = {
  kpis: CalculatedKpis;
};

export function RoeRoceChartWidget({ kpis }: Props) {
  const { isDark } = useTheme();

  const roeSeries = useMemo(() => buildRentabilitySeries(kpis.roe, "roe"), [kpis.roe]);
  const roceSeries = useMemo(() => buildRentabilitySeries(kpis.roce, "roce"), [kpis.roce]);
  const comparisonSeries = useMemo<ChartPoint[]>(
    () => buildComparisonSeries(roeSeries, roceSeries),
    [roeSeries, roceSeries],
  );

  const roePercent = normalizePercentInput(kpis.roe);
  const rocePercent = normalizePercentInput(kpis.roce);
  const spread = useMemo(() => {
    if (roePercent === null || rocePercent === null) return null;
    return round(roePercent - rocePercent, 2);
  }, [roePercent, rocePercent]);

  const chartGeometry = useMemo(() => computeChartGeometry(comparisonSeries), [comparisonSeries]);
  const spreadTone = spread === null ? "na" : spread >= 0 ? "positive" : "negative";

  // Couleurs theme-aware — sans ça les courbes (ROCE blanc, ROE gold pâle)
  // sont invisibles sur fond clair.
  const goldColor = isDark ? "#C5A059" : "#8B6F2A";
  const roceColor = isDark ? "#ffffff" : "#0A0A0F";
  const spreadColor =
    spreadTone === "positive" ? goldColor : spreadTone === "negative" ? "#ef4444" : roceColor;
  const gridColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const axisColor = isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.18)";

  return (
    <article className="precision-card group flex h-full flex-col rounded-2xl p-6">
      <div className="card-header mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Analyse de la création de valeur</h3>
          <p className="mt-1 text-[10px] font-mono uppercase text-white/45">
            ROE vs ROCE (effet de levier)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[10px] uppercase text-white/70">
          <LegendDot color={roceColor} label="ROCE (activité)" />
          <LegendDot color={spreadColor} label="ROE (actionnaire)" />
        </div>
      </div>

      <div className="relative flex-1 min-h-[220px] w-full">
        <svg className="h-full w-full" viewBox="0 0 1000 250" preserveAspectRatio="none">
          <line x1="0" y1="52" x2="1000" y2="52" stroke={gridColor} strokeDasharray="4 4" />
          <line x1="0" y1="102" x2="1000" y2="102" stroke={gridColor} strokeDasharray="4 4" />
          <line x1="0" y1="152" x2="1000" y2="152" stroke={gridColor} strokeDasharray="4 4" />
          <line x1="0" y1="202" x2="1000" y2="202" stroke={gridColor} strokeDasharray="4 4" />
          <line x1="0" y1="0" x2="0" y2="250" stroke={axisColor} />
          <line x1="0" y1="250" x2="1000" y2="250" stroke={axisColor} />

          <polygon
            points={chartGeometry.spreadArea}
            fill={
              spreadTone === "positive"
                ? "rgba(197,160,89,0.16)"
                : spreadTone === "negative"
                  ? "rgba(239,68,68,0.13)"
                  : "rgba(255,255,255,0.08)"
            }
          />

          <polyline points={chartGeometry.roceLine} fill="none" stroke={roceColor} strokeWidth="2.4" />
          <polyline points={chartGeometry.roeLine} fill="none" stroke={spreadColor} strokeWidth="2.8" />

          {chartGeometry.rocePoints.map((point, index) => (
            <circle
              key={`roce-${point.x}`}
              cx={point.x}
              cy={point.y}
              r={index === chartGeometry.lastIndex ? 5 : 4}
              fill="#ffffff"
            />
          ))}
          {chartGeometry.roePoints.map((point, index) => (
            <circle
              key={`roe-${point.x}`}
              cx={point.x}
              cy={point.y}
              r={index === chartGeometry.lastIndex ? 6 : 4}
              fill={spreadColor}
            />
          ))}

          <line
            x1={chartGeometry.lastPoint.x}
            x2={chartGeometry.lastPoint.x}
            y1={chartGeometry.lastPoint.roceY}
            y2={chartGeometry.lastPoint.roeY}
            stroke={spreadColor}
            strokeDasharray="4 4"
            strokeWidth="2"
          />
        </svg>

        <div
          className="absolute rounded-md border bg-black/65 px-2 py-1 text-[11px]"
          style={{
            left: `${Math.max(8, chartGeometry.lastPoint.x / 10 - 10)}%`,
            top: `${Math.max(8, chartGeometry.lastPoint.midY / 2.8)}%`,
            borderColor: spreadColor,
            color: spreadColor,
          }}
        >
          {spread === null ? "Écart indisponible" : `Écart ROE-ROCE : ${formatSignedSpread(spread)}`}
        </div>

        <div className="absolute inset-x-2 bottom-[-20px] flex justify-between text-[10px] font-mono text-white/45">
          {comparisonSeries.map((point) => (
            <span key={point.label}>{point.label}</span>
          ))}
        </div>
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

function buildComparisonSeries(
  roeSeries: Array<{ month: string; value: number }>,
  roceSeries: Array<{ month: string; value: number }>,
): ChartPoint[] {
  const indexes = [0, 3, 7, 11];
  return indexes
    .filter((i) => roeSeries[i] && roceSeries[i])
    .map((i) => ({ label: roeSeries[i].month, roe: roeSeries[i].value, roce: roceSeries[i].value }));
}

function computeChartGeometry(series: ChartPoint[]) {
  const width = 1000;
  const height = 250;
  const topPadding = 20;
  const bottomPadding = 24;
  const plotHeight = height - topPadding - bottomPadding;

  const safeSeries =
    series.length >= 2
      ? series
      : [
          { label: "Début", roe: 0, roce: 0 },
          { label: "Fin", roe: 0, roce: 0 },
        ];

  const allValues = safeSeries.flatMap((p) => [p.roe, p.roce]);
  const minValue = Math.min(...allValues, 0) - 2;
  const maxValue = Math.max(...allValues, 0) + 2;
  const spread = maxValue - minValue || 1;

  const xStep = width / (safeSeries.length - 1);
  const yScale = (value: number) =>
    height - bottomPadding - ((value - minValue) / spread) * plotHeight;

  const roePoints = safeSeries.map((p, i) => ({ x: i * xStep, y: yScale(p.roe) }));
  const rocePoints = safeSeries.map((p, i) => ({ x: i * xStep, y: yScale(p.roce) }));

  const roeLine = roePoints.map((p) => `${p.x},${p.y}`).join(" ");
  const roceLine = rocePoints.map((p) => `${p.x},${p.y}`).join(" ");
  const spreadArea = `${roeLine} ${[...rocePoints].reverse().map((p) => `${p.x},${p.y}`).join(" ")}`;

  const lastIndex = safeSeries.length - 1;
  const lastPoint = {
    x: roePoints[lastIndex].x,
    roeY: roePoints[lastIndex].y,
    roceY: rocePoints[lastIndex].y,
    midY: (roePoints[lastIndex].y + rocePoints[lastIndex].y) / 2,
  };

  return { roeLine, roceLine, spreadArea, roePoints, rocePoints, lastPoint, lastIndex };
}

function formatSignedSpread(value: number): string {
  if (value > 0) return `+${formatNumber(value, 2)} pts`;
  if (value < 0) return `${formatNumber(value, 2)} pts`;
  return "0.00 pts";
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
