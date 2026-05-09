"use client";

import { Maximize2 } from "lucide-react";
import { memo, useId, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { formatPercent, INSUFFICIENT_DATA_LABEL } from "@/components/dashboard/formatting";
import { BreakEvenFullscreenModal } from "@/components/dashboard/navigation/BreakEvenFullscreenModal";
import { BreakEvenPointGuide, BreakEvenPointMarker } from "@/components/dashboard/navigation/BreakEvenPointMarker";
import { BreakEvenTooltip } from "@/components/dashboard/navigation/BreakEvenTooltip";
import type { BreakEvenModel } from "@/lib/dashboard/tabs/valueCreationData";

type BreakEvenChartProps = {
  model: BreakEvenModel;
  isDark: boolean;
};

type BreakEvenChartCanvasProps = {
  model: BreakEvenModel;
  isDark: boolean;
  instanceId: string;
  heightClass: string;
  onOpenFullscreen?: () => void;
};

type SummaryCardProps = {
  label: string;
  value: string;
  hint: string;
  isDark: boolean;
  tone?: "neutral" | "accent" | "danger" | "success";
};

const CHART_MARGIN = {
  top: 78,
  right: 32,
  bottom: 30,
  left: 20
} as const;
const CHART_Y_AXIS_WIDTH = 94;

// Hauteur viewport-based : `h-full` ne fonctionnait pas car le parent
// direct (`<div className="space-y-5">`) n'a pas de hauteur explicite, donc
// h-full résolvait à 0 et Recharts ne dessinait pas les courbes.
//   - min 420 px : plancher pour rester lisible en widget M (~280 px utiles
//                  pour le chart après le header + summary cards)
//   - h-[60vh]   : taille naturelle ~650 px sur FHD, ~780 px sur 4K
//   - max 820 px : permet au widget XL (4 rangées = 860 px) d'exploiter
//                  presque toute sa place sans déborder du card
const INLINE_HEIGHT_CLASS = "min-h-[420px] h-[60vh] max-h-[820px]";
const FULLSCREEN_HEIGHT_CLASS = "min-h-[500px] h-[calc(100vh-12rem)]";

function BreakEvenChartComponent({ model, isDark }: BreakEvenChartProps) {
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const chartId = useId().replace(/:/g, "");
  const intersectionWithinYear = Boolean(model.intersection?.withinFiscalYear);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <SummaryCard
          label="Point mort"
          value={formatCurrencyValue(model.metrics.pointMort)}
          hint="CA ou la MSCV absorbe exactement les charges fixes."
          isDark={isDark}
          tone={intersectionWithinYear ? "accent" : "neutral"}
        />
        <SummaryCard
          label="Date du point mort"
          value={buildBreakEvenDateLabel(model)}
          hint={buildBreakEvenTimingHint(model)}
          isDark={isDark}
          tone={buildTimingTone(model)}
        />
        <SummaryCard
          label="TMSCV retenu"
          value={model.metrics.tmscv === null ? INSUFFICIENT_DATA_LABEL : formatPercent(model.metrics.tmscv, 1)}
          hint="Calculé sur les ventes de marchandises + la production vendue."
          isDark={isDark}
          tone={model.metrics.tmscv !== null && model.metrics.tmscv > 0 ? "success" : "danger"}
        />
      </div>

      <BreakEvenChartCanvas
        model={model}
        isDark={isDark}
        instanceId={`${chartId}-inline`}
        heightClass={INLINE_HEIGHT_CLASS}
        onOpenFullscreen={() => setIsFullscreenOpen(true)}
      />

      <BreakEvenFullscreenModal
        isOpen={isFullscreenOpen}
        onClose={() => setIsFullscreenOpen(false)}
        title="Seuil de rentabilité - Vue plein écran"
        subtitle="Visualisation détaillée du point mort (CA, coûts fixes, coûts totaux)"
        isDark={isDark}
      >
        <BreakEvenChartCanvas
          model={model}
          isDark={isDark}
          instanceId={`${chartId}-fullscreen`}
          heightClass={FULLSCREEN_HEIGHT_CLASS}
        />
      </BreakEvenFullscreenModal>
    </div>
  );
}

export const BreakEvenChart = memo(BreakEvenChartComponent);

function BreakEvenChartCanvas({
  model,
  isDark,
  instanceId,
  heightClass,
  onOpenFullscreen
}: BreakEvenChartCanvasProps) {
  const chartValues = model.points.flatMap((point) => [point.ca, point.fixedCosts, point.totalCosts]);
  const maxValue = Math.max(...chartValues, model.intersection?.value ?? 0, 1);
  const minValue = Math.min(0, ...chartValues);
  const yDomainMin = minValue >= 0 ? 0 : minValue * 1.1;
  const yDomainMax = maxValue <= 0 ? 1 : maxValue * 1.16;
  const intersectionWithinYear = Boolean(model.intersection?.withinFiscalYear);
  const lossAreaEnd = intersectionWithinYear ? (model.intersection?.monthIndex ?? 0) : model.closureIndex;
  const profitAreaStart = model.metrics.pointMort === 0 ? 0 : (model.intersection?.monthIndex ?? model.closureIndex);
  const showProfitArea = model.metrics.pointMort === 0 || intersectionWithinYear;
  const markerRatio =
    model.intersection && model.closureIndex > 0
      ? clampNumber(model.intersection.monthIndex / model.closureIndex, 0, 1)
      : null;
  const markerLeftCss =
    markerRatio === null
      ? null
      : `calc(${CHART_MARGIN.left + CHART_Y_AXIS_WIDTH}px + (100% - ${
          CHART_MARGIN.left + CHART_MARGIN.right + CHART_Y_AXIS_WIDTH
        }px) * ${markerRatio})`;

  const lossGradientId = `${instanceId}-loss-zone`;
  const profitGradientId = `${instanceId}-profit-zone`;
  const caGlowId = `${instanceId}-ca-glow`;
  const totalGlowId = `${instanceId}-total-glow`;

  const panelClass = isDark
    ? "bg-[linear-gradient(180deg,rgba(14,14,18,0.96)_0%,rgba(9,9,12,0.98)_100%)] shadow-[0_26px_90px_rgba(2,6,23,0.42)]"
    : "bg-[linear-gradient(180deg,rgba(255,255,255,0.97)_0%,rgba(248,250,252,0.99)_100%)] shadow-[0_20px_70px_rgba(15,23,42,0.12)]";
  const gridStroke = isDark ? "rgba(255,255,255,0.12)" : "rgba(71,85,105,0.2)";
  const axisStroke = isDark ? "rgba(255,255,255,0.28)" : "rgba(51,65,85,0.34)";
  const tickFill = isDark ? "rgba(255,255,255,0.74)" : "rgba(30,41,59,0.82)";
  const lossBadgeClass = isDark
    ? "border-rose-400/35 bg-[linear-gradient(120deg,rgba(244,63,94,0.16)_0%,rgba(239,68,68,0.05)_100%)] text-rose-100 shadow-[0_8px_30px_rgba(244,63,94,0.22)]"
    : "border-rose-400/45 bg-[linear-gradient(120deg,rgba(254,242,242,0.98)_0%,rgba(254,226,226,0.86)_100%)] text-rose-700";
  const profitBadgeClass = isDark
    ? "border-emerald-400/35 bg-[linear-gradient(120deg,rgba(16,185,129,0.08)_0%,rgba(52,211,153,0.18)_100%)] text-emerald-100 shadow-[0_8px_30px_rgba(16,185,129,0.2)]"
    : "border-emerald-500/45 bg-[linear-gradient(120deg,rgba(240,253,250,0.96)_0%,rgba(209,250,229,0.84)_100%)] text-emerald-700";

  return (
    <div className={`relative w-full rounded-2xl overflow-visible ${heightClass} ${panelClass}`}>
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-75"
        style={{
          background: isDark
            ? "radial-gradient(circle at top right, rgba(197,160,89,0.16), transparent 34%)"
            : "radial-gradient(circle at top right, rgba(197,160,89,0.14), transparent 34%)"
        }}
        aria-hidden="true"
      />

      {onOpenFullscreen ? (
        <div className="absolute right-3 top-3 z-40">
          <button
            type="button"
            onClick={onOpenFullscreen}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition ${
              isDark
                ? "border-white/15 bg-black/35 text-white/70 hover:border-quantis-gold/45 hover:bg-quantis-gold/12 hover:text-quantis-gold"
                : "border-slate-300 bg-white/95 text-slate-600 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-700"
            }`}
            aria-label="Ouvrir le graphique en plein écran"
            title="Plein écran"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {intersectionWithinYear && markerLeftCss ? (
        <BreakEvenPointGuide
          left={markerLeftCss}
          top={CHART_MARGIN.top}
          bottom={CHART_MARGIN.bottom}
          isDark={isDark}
          label="Point mort"
        />
      ) : null}

      {model.hasUsableData ? (
        // ResponsiveContainer (au lieu du `responsive` prop direct sur ComposedChart) :
        // dans recharts 3.x avec React 19, le `responsive` prop déclenche une boucle
        // ResizeObserver → setState → re-render → re-attach ref → setState → "Maximum
        // update depth exceeded". ResponsiveContainer est l'API stable et utilise un debounce
        // interne sur les changements de taille, ce qui supprime la boucle.
        <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={model.points}
          margin={CHART_MARGIN}
        >
          <defs>
            <linearGradient id={lossGradientId} x1="0" y1="0" x2="1" y2="0">
              {/* En light : intensité uniforme faible sur toute la zone
                  (cf. retour utilisateur 08/05/2026 : pas de dégradé,
                  même opacité partout). En dark : on conserve le dégradé
                  original qui marche bien sur fond sombre. */}
              <stop offset="0%" stopColor={isDark ? "rgba(248,113,113,0.22)" : "rgba(239,68,68,0.06)"} />
              <stop offset="55%" stopColor={isDark ? "rgba(248,113,113,0.1)" : "rgba(239,68,68,0.06)"} />
              <stop offset="100%" stopColor={isDark ? "rgba(248,113,113,0.02)" : "rgba(239,68,68,0.06)"} />
            </linearGradient>
            <linearGradient id={profitGradientId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={isDark ? "rgba(16,185,129,0.03)" : "rgba(16,185,129,0.06)"} />
              <stop offset="45%" stopColor={isDark ? "rgba(16,185,129,0.09)" : "rgba(16,185,129,0.06)"} />
              <stop offset="100%" stopColor={isDark ? "rgba(16,185,129,0.2)" : "rgba(16,185,129,0.06)"} />
            </linearGradient>

            <filter id={caGlowId} x="-45%" y="-45%" width="190%" height="190%">
              <feDropShadow
                dx="0"
                dy="0"
                stdDeviation="3.1"
                floodColor={isDark ? "rgba(248,250,252,0.86)" : "rgba(15,23,42,0.52)"}
              />
            </filter>
            <filter id={totalGlowId} x="-45%" y="-45%" width="190%" height="190%">
              <feDropShadow dx="0" dy="0" stdDeviation="2.8" floodColor="rgba(197,160,89,0.66)" />
            </filter>
          </defs>

          {lossAreaEnd > 0 ? (
            <ReferenceArea x1={0} x2={lossAreaEnd} fill={`url(#${lossGradientId})`} ifOverflow="extendDomain" strokeOpacity={0} />
          ) : null}

          {showProfitArea ? (
            <ReferenceArea
              x1={profitAreaStart}
              x2={model.closureIndex}
              fill={`url(#${profitGradientId})`}
              ifOverflow="extendDomain"
              strokeOpacity={0}
            />
          ) : null}

          <CartesianGrid vertical stroke={gridStroke} strokeDasharray="3 6" />

          <XAxis
            type="number"
            dataKey="monthIndex"
            domain={[0, model.closureIndex]}
            ticks={model.xTicks}
            tickFormatter={formatBreakEvenTick}
            axisLine={{ stroke: axisStroke }}
            tickLine={false}
            tick={{ fill: tickFill, fontSize: 11, fontWeight: 500 }}
            tickMargin={12}
            label={{
              value: "Mois de l'exercice",
              position: "insideBottom",
              offset: -10,
              fill: tickFill,
              fontSize: 11
            }}
          />
          <YAxis
            type="number"
            domain={[yDomainMin, yDomainMax]}
            axisLine={{ stroke: axisStroke }}
            tickLine={false}
            tick={{ fill: tickFill, fontSize: 11, fontWeight: 500 }}
            tickFormatter={formatAxisCurrency}
            tickMargin={8}
            width={CHART_Y_AXIS_WIDTH}
            label={{
              value: "Montants (EUR)",
              angle: -90,
              position: "insideLeft",
              fill: tickFill,
              fontSize: 11
            }}
          />
          <Tooltip
            cursor={{ stroke: "rgba(197,160,89,0.55)", strokeDasharray: "5 5", strokeWidth: 1.8 }}
            content={(props) => <BreakEvenTooltip {...props} isDark={isDark} />}
            allowEscapeViewBox={{ x: true, y: true }}
            wrapperStyle={{ zIndex: 120, overflow: "visible", pointerEvents: "none" }}
            isAnimationActive
            animationDuration={120}
          />

          <Line
            type="linear"
            dataKey="ca"
            name="CA"
            stroke={isDark ? "#f8fafc" : "#0f172a"}
            strokeWidth={3.5}
            strokeOpacity={1}
            dot={false}
            style={{ filter: `url(#${caGlowId})` }}
            activeDot={{ r: 6.6, strokeWidth: 0, fill: isDark ? "#f8fafc" : "#0f172a" }}
            isAnimationActive
            animationDuration={1200}
            animationEasing="ease-out"
          />
          <Line
            type="linear"
            dataKey="fixedCosts"
            name="Couts fixes"
            stroke={isDark ? "rgba(255,255,255,0.36)" : "rgba(100,116,139,0.78)"}
            strokeWidth={2.05}
            strokeDasharray="5 5"
            strokeOpacity={1}
            dot={false}
            activeDot={{ r: 5.2, strokeWidth: 0, fill: isDark ? "#94a3b8" : "#64748b" }}
            isAnimationActive
            animationDuration={1100}
            animationEasing="ease-out"
          />
          <Line
            type="linear"
            dataKey="totalCosts"
            name="Coûts totaux"
            stroke="#C5A059"
            strokeWidth={3.1}
            strokeOpacity={1}
            dot={false}
            style={{ filter: `url(#${totalGlowId})` }}
            activeDot={{ r: 6.4, strokeWidth: 0, fill: "#C5A059" }}
            isAnimationActive
            animationDuration={1240}
            animationBegin={100}
            animationEasing="ease-out"
          />

          {intersectionWithinYear && model.intersection ? (
            <BreakEvenPointMarker
              x={model.intersection.monthIndex}
              y={model.intersection.value}
              isDark={isDark}
              tone="gold"
              ifOverflow="extendDomain"
            />
          ) : null}
        </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-full items-center justify-center px-6 text-center">
          <p className={`max-w-md text-sm ${isDark ? "text-white/60" : "text-slate-600"}`}>
            Données insuffisantes pour calculer précisément le point mort. Le graphique s&apos;active dès que le
            CA, les charges fixes et les charges variables sont disponibles.
          </p>
        </div>
      )}

      {model.hasUsableData ? (
        <>
          <div className="pointer-events-none absolute bottom-4 left-4 z-30">
            <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] ${lossBadgeClass}`}>
              {buildLossBadgeLabel(model)}
            </span>
          </div>

          <div className={`pointer-events-none absolute right-4 z-30 ${onOpenFullscreen ? "top-14" : "top-4"}`}>
            <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] ${profitBadgeClass}`}>
              {buildProfitBadgeLabel(model)}
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value, hint, isDark, tone = "neutral" }: SummaryCardProps) {
  const toneClass = isDark
    ? tone === "accent"
      ? "border-quantis-gold/25 bg-quantis-gold/8 text-quantis-gold"
      : tone === "danger"
        ? "border-rose-400/20 bg-rose-500/8 text-rose-200"
        : tone === "success"
          ? "border-emerald-400/20 bg-emerald-500/8 text-emerald-200"
          : "border-white/8 bg-white/[0.03] text-white"
    : tone === "accent"
      ? "border-amber-500/30 bg-amber-50 text-amber-700"
      : tone === "danger"
        ? "border-rose-300 bg-rose-50 text-rose-700"
        : tone === "success"
          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-white text-slate-900";

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-current/70">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-tight text-current">{value}</p>
      <p className="mt-2 text-xs text-current/70">{hint}</p>
    </div>
  );
}

function formatBreakEvenTick(value: number): string {
  // L'axe X s'arrête désormais au mois 12. Si une valeur > 12 surgit (legacy),
  // on l'aligne à 12 plutôt que d'afficher "Clôture".
  return `${Math.min(Math.round(value), 12)}`;
}

function formatAxisCurrency(value: number): string {
  const absolute = Math.abs(value);

  if (absolute >= 1_000_000) {
    const rounded = absolute >= 10_000_000 ? 0 : 1;
    return `${(value / 1_000_000).toFixed(rounded).replace(".", ",")} M€`;
  }

  if (absolute >= 1_000) {
    const rounded = absolute >= 100_000 ? 0 : 1;
    return `${(value / 1_000).toFixed(rounded).replace(".", ",")} k€`;
  }

  return `${Math.round(value).toLocaleString("fr-FR")} €`;
}

function formatCurrencyValue(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return INSUFFICIENT_DATA_LABEL;
  }

  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  }).format(value);
}

function buildBreakEvenDateLabel(model: BreakEvenModel): string {
  const days = model.metrics.pointMortDateDays;
  const months = model.metrics.pointMortDateMonths;

  if (days === null || months === null) {
    return "Non calculable";
  }

  if (days <= 0) {
    return "Dès le démarrage";
  }

  if (days <= 365) {
    return `Jour ${Math.round(days)} (~${Math.max(1, Math.round(months))} mois)`;
  }

  return `Après clôture (~${Math.round(months)} mois)`;
}

function buildBreakEvenTimingHint(model: BreakEvenModel): string {
  if (model.metrics.pointMortDateDays === null) {
    return "TMSCV nul ou négatif, ou données incomplètes.";
  }

  if (model.metrics.pointMortDateDays <= 365) {
    return "Le seuil est atteint dans l'exercice courant.";
  }

  return "Le seuil dépasse la clôture annuelle.";
}

function buildTimingTone(model: BreakEvenModel): SummaryCardProps["tone"] {
  if (model.metrics.pointMortDateDays === null) {
    return "danger";
  }

  if (model.metrics.pointMortDateDays <= 365) {
    return "success";
  }

  return "danger";
}

function buildLossBadgeLabel(model: BreakEvenModel): string {
  if (model.metrics.pointMort === 0) {
    return "Zone pertes nulle";
  }

  if (model.intersection?.withinFiscalYear) {
    return "Zone pertes";
  }

  return "Pertes sur l'exercice";
}

function buildProfitBadgeLabel(model: BreakEvenModel): string {
  if (model.metrics.pointMort === 0) {
    return "Bénéfices immédiats";
  }

  if (model.intersection?.withinFiscalYear) {
    return "Zone bénéfices";
  }

  return "Bénéfices après clôture";
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
