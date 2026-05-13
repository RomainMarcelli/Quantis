// File: components/dashboard/widgets/WidgetPreview.tsx
// Role: mini-illustration SVG stylisée par type de viz, rendue dans le
// KpiPickerDrawer pour donner un aperçu visuel du widget sélectionné
// avant ajout. Pas de dépendance aux données réelles — chaque preview
// utilise des valeurs fictives représentatives de la silhouette finale.
"use client";

import { Cpu, ListChecks, AlertTriangle } from "lucide-react";
import type { WidgetVizType } from "@/types/dashboard";
import { getKpiDefinition } from "@/lib/kpi/kpiRegistry";

type WidgetPreviewProps = {
  vizType: WidgetVizType;
  kpiId: string;
};

// Couleurs Vyzor utilisées dans toutes les illustrations.
const C_GOLD = "#D4AF37";
const C_WHITE = "#FFFFFF";
const C_GREEN = "#10B981";
const C_GRID = "rgba(255,255,255,0.08)";
const C_AXIS = "rgba(255,255,255,0.25)";

export function WidgetPreview({ vizType, kpiId }: WidgetPreviewProps) {
  const def = getKpiDefinition(kpiId);
  const title = def?.shortLabel ?? kpiId;

  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-4">
      <p className="mb-2 text-[10px] font-mono uppercase tracking-[0.18em] text-white/45">
        Aperçu
      </p>
      <div className="flex h-[180px] items-center justify-center overflow-hidden rounded-lg border border-white/[0.04] bg-quantis-base/40 p-3">
        {renderVizPreview(vizType, title)}
      </div>
    </div>
  );
}

function renderVizPreview(vizType: WidgetVizType, title: string) {
  switch (vizType) {
    case "kpiCard":
      return <KpiCardPreview title={title} />;
    case "lineChart":
      return <LineChartPreview />;
    case "barChart":
      return <BarChartPreview />;
    case "gauge":
      return <GaugePreview />;
    case "donut":
      return <DonutPreview />;
    case "waterfall":
      return <WaterfallPreview />;
    case "comparison":
      return <ComparisonPreview />;
    case "evolutionChart":
      return <EvolutionPreview />;
    case "quantisScore":
      return <VyzorScorePreview />;
    case "aiInsight":
      return <AiInsightPreview />;
    case "alertList":
      return <AlertListPreview />;
    case "actionList":
      return <ActionListPreview />;
    default:
      return null;
  }
}

// ─── KpiCard ───────────────────────────────────────────────────────────
function KpiCardPreview({ title }: { title: string }) {
  return (
    <div className="flex h-full w-full flex-col justify-between">
      <p className="text-[9px] font-mono uppercase tracking-wide text-white/45">
        {title}
      </p>
      <div>
        <p className="text-3xl font-bold tracking-tight text-white">123 456 €</p>
        <p className="mt-1 text-xs font-medium text-emerald-400">↗ +24,6%</p>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-rose-400" />
        <span className="text-[10px] uppercase tracking-wide text-rose-300">
          Bas 25 %
        </span>
      </div>
    </div>
  );
}

// ─── Charts (SVG silhouettes) ──────────────────────────────────────────
function LineChartPreview() {
  // Sinusoïde bruitée + zone sous la courbe.
  const points = [10, 28, 22, 40, 35, 55, 48, 70, 65, 80, 72, 88];
  const w = 280;
  const h = 130;
  const stepX = w / (points.length - 1);
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${i * stepX} ${h - p}`)
    .join(" ");
  const area = `${path} L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full">
      <line x1={0} y1={h - 1} x2={w} y2={h - 1} stroke={C_AXIS} strokeWidth={0.5} />
      <path d={area} fill={C_GOLD} fillOpacity={0.15} />
      <path d={path} stroke={C_GOLD} strokeWidth={2} fill="none" />
      {points.map((p, i) => (
        <circle key={i} cx={i * stepX} cy={h - p} r={2.5} fill={C_GOLD} />
      ))}
    </svg>
  );
}

function BarChartPreview() {
  const bars = [40, 65, 30, 78, 55, 85, 60];
  const w = 280;
  const h = 130;
  const barW = w / bars.length - 6;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full">
      <line x1={0} y1={h - 1} x2={w} y2={h - 1} stroke={C_AXIS} strokeWidth={0.5} />
      {bars.map((p, i) => (
        <rect
          key={i}
          x={i * (w / bars.length) + 3}
          y={h - p}
          width={barW}
          height={p}
          rx={2}
          fill={C_GOLD}
          fillOpacity={0.85}
        />
      ))}
    </svg>
  );
}

function GaugePreview() {
  // Demi-cercle de 0 à 180°, aiguille à ~70%.
  const size = 140;
  const cx = size / 2;
  const cy = size * 0.85;
  const r = 50;
  const total = 0.7;
  const arc = (frac: number) => {
    const a = Math.PI * (1 - frac);
    return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
  };
  const start = arc(0);
  const filledEnd = arc(total);
  const fullEnd = arc(1);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-full">
      <path
        d={`M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${fullEnd.x} ${fullEnd.y}`}
        stroke={C_GRID}
        strokeWidth={10}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d={`M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${filledEnd.x} ${filledEnd.y}`}
        stroke={C_GOLD}
        strokeWidth={10}
        fill="none"
        strokeLinecap="round"
      />
      <text x={cx} y={cy - 8} textAnchor="middle" className="fill-white" fontSize={20} fontWeight={700}>
        70%
      </text>
    </svg>
  );
}

function DonutPreview() {
  const size = 140;
  const cx = size / 2;
  const cy = size / 2;
  const r = 50;
  const segments = [
    { frac: 0.45, color: C_GOLD },
    { frac: 0.3, color: C_WHITE },
    { frac: 0.25, color: C_GREEN }
  ];
  let acc = 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-full">
      {segments.map((seg, i) => {
        const start = acc;
        acc += seg.frac;
        const a0 = 2 * Math.PI * start - Math.PI / 2;
        const a1 = 2 * Math.PI * acc - Math.PI / 2;
        const x0 = cx + r * Math.cos(a0);
        const y0 = cy + r * Math.sin(a0);
        const x1 = cx + r * Math.cos(a1);
        const y1 = cy + r * Math.sin(a1);
        const large = seg.frac > 0.5 ? 1 : 0;
        return (
          <path
            key={i}
            d={`M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`}
            stroke={seg.color}
            strokeWidth={14}
            fill="none"
          />
        );
      })}
    </svg>
  );
}

function WaterfallPreview() {
  // Cascade : start → +X → -Y → +Z → end.
  const w = 280;
  const h = 130;
  const bars = [
    { x: 0.05, y: 0.15, h: 0.55, color: C_WHITE },
    { x: 0.22, y: 0.05, h: 0.1, color: C_GREEN },
    { x: 0.39, y: 0.15, h: 0.2, color: "#EF4444" },
    { x: 0.56, y: 0.35, h: 0.15, color: C_GREEN },
    { x: 0.73, y: 0.5, h: 0.4, color: C_GOLD }
  ];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full">
      <line x1={0} y1={h - 1} x2={w} y2={h - 1} stroke={C_AXIS} strokeWidth={0.5} />
      {bars.map((b, i) => (
        <rect
          key={i}
          x={b.x * w}
          y={b.y * h}
          width={w * 0.13}
          height={b.h * h}
          fill={b.color}
          fillOpacity={0.85}
          rx={2}
        />
      ))}
    </svg>
  );
}

function ComparisonPreview() {
  const w = 280;
  const h = 110;
  const cy = h / 2;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full">
      {/* Ligne axe P25 → P75 */}
      <line x1={30} y1={cy} x2={w - 30} y2={cy} stroke={C_AXIS} strokeWidth={2} />
      {/* P25 */}
      <circle cx={50} cy={cy} r={8} fill="#EF4444" />
      <text x={50} y={cy + 28} textAnchor="middle" className="fill-white/60" fontSize={9}>
        P25
      </text>
      {/* P50 */}
      <circle cx={140} cy={cy} r={8} fill={C_GOLD} />
      <text x={140} y={cy + 28} textAnchor="middle" className="fill-white/60" fontSize={9}>
        P50
      </text>
      {/* P75 */}
      <circle cx={230} cy={cy} r={8} fill={C_GREEN} />
      <text x={230} y={cy + 28} textAnchor="middle" className="fill-white/60" fontSize={9}>
        P75
      </text>
      {/* Position du KPI */}
      <circle cx={170} cy={cy} r={5} stroke={C_WHITE} strokeWidth={2} fill="none" />
      <text x={170} y={cy - 14} textAnchor="middle" className="fill-white" fontSize={9} fontWeight={600}>
        Vous
      </text>
    </svg>
  );
}

function EvolutionPreview() {
  // 3 séries (CA / EBE / Résultat net).
  const w = 280;
  const h = 130;
  const series = [
    { points: [55, 60, 50, 70, 65, 80, 75, 85], color: C_WHITE },
    { points: [30, 35, 25, 45, 40, 50, 48, 55], color: C_GOLD },
    { points: [10, 15, 8, 22, 18, 28, 25, 32], color: C_GREEN }
  ];
  const stepX = w / (series[0].points.length - 1);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full">
      <line x1={0} y1={h - 1} x2={w} y2={h - 1} stroke={C_AXIS} strokeWidth={0.5} />
      {series.map((s, i) => {
        const path = s.points
          .map((p, j) => `${j === 0 ? "M" : "L"} ${j * stepX} ${h - p}`)
          .join(" ");
        return (
          <path key={i} d={path} stroke={s.color} strokeWidth={2} fill="none" />
        );
      })}
    </svg>
  );
}

function VyzorScorePreview() {
  // Arc circulaire + nombre central + 4 piliers en bas.
  return (
    <div className="flex h-full w-full flex-col items-center justify-between py-1">
      <svg viewBox="0 0 140 90" className="h-[68%]">
        {(() => {
          const cx = 70;
          const cy = 70;
          const r = 50;
          const frac = 0.52;
          const a0 = Math.PI;
          const a1 = Math.PI * (1 - frac);
          const x0 = cx + r * Math.cos(a0);
          const y0 = cy + r * Math.sin(a0);
          const x1 = cx + r * Math.cos(a1);
          const y1 = cy + r * Math.sin(a1);
          const xEnd = cx + r * Math.cos(0);
          const yEnd = cy + r * Math.sin(0);
          return (
            <>
              <path
                d={`M ${x0} ${y0} A ${r} ${r} 0 0 1 ${xEnd} ${yEnd}`}
                stroke={C_GRID}
                strokeWidth={6}
                fill="none"
              />
              <path
                d={`M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`}
                stroke={C_GOLD}
                strokeWidth={6}
                fill="none"
              />
              <text x={cx} y={cy - 6} textAnchor="middle" className="fill-white" fontSize={26} fontWeight={700}>
                52
              </text>
            </>
          );
        })()}
      </svg>
      <div className="flex w-full justify-between text-center text-[8px] uppercase tracking-wide text-white/55">
        <span>Renta</span>
        <span>Solva</span>
        <span>Liqui</span>
        <span>Effi</span>
      </div>
    </div>
  );
}

// ─── Listes / blocs IA ─────────────────────────────────────────────────
function AiInsightPreview() {
  return (
    <div className="flex h-full w-full items-center gap-3 rounded-md border border-quantis-gold/20 bg-quantis-gold/5 p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-quantis-gold/30 bg-quantis-gold/10">
        <Cpu className="h-4 w-4 text-quantis-gold" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-[9px] font-mono uppercase tracking-wide text-quantis-gold">
          Recommandation stratégique
        </p>
        <p className="text-[11px] leading-snug text-white/85">
          Lancer un plan de relance commerciale ciblé sur les comptes prioritaires.
        </p>
      </div>
    </div>
  );
}

function AlertListPreview() {
  const items = [
    { color: "bg-rose-400", label: "Trésorerie sous le seuil critique" },
    { color: "bg-amber-400", label: "BFR en hausse de 18 %" },
    { color: "bg-amber-400", label: "Marge brute < benchmark" }
  ];
  return (
    <div className="flex h-full w-full flex-col gap-2 p-1">
      <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wide text-white/45">
        <AlertTriangle className="h-3 w-3 text-amber-400" />
        Alertes
      </div>
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2 rounded border border-white/5 bg-white/[0.02] px-2 py-1.5">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${it.color}`} />
          <span className="truncate text-[10px] text-white/75">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

function ActionListPreview() {
  const items = [
    "Relancer les top 5 clients",
    "Renégocier les délais fournisseurs",
    "Préparer un dossier de financement court terme"
  ];
  return (
    <div className="flex h-full w-full flex-col gap-2 p-1">
      <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wide text-white/45">
        <ListChecks className="h-3 w-3 text-quantis-gold" />
        Plan d&apos;action
      </div>
      {items.map((it, i) => (
        <div key={i} className="flex items-start gap-2 rounded border border-white/5 bg-white/[0.02] px-2 py-1.5">
          <span className="mt-0.5 inline-block h-3 w-3 shrink-0 rounded-sm border border-white/30" />
          <span className="text-[10px] leading-snug text-white/75">{it}</span>
        </div>
      ))}
    </div>
  );
}
