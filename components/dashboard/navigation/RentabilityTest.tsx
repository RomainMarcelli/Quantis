// File: components/dashboard/navigation/RentabilityTest.tsx
// Role: propose une variante "test" premium de la section Ratio et rentabilité avec les KPI réels de l'analyse.
"use client";

import { type MouseEvent, type ReactNode, useMemo, useState } from "react";
import {
  ArrowRight,
  Award,
  BriefcaseBusiness,
  Cpu,
  Scale,
} from "lucide-react";
import { formatNumber } from "@/components/dashboard/formatting";
import { KpiTrendPill } from "@/components/dashboard/navigation/KpiTrendPill";
import { TestTopStatus } from "@/components/dashboard/navigation/TestTopStatus";
import { useAnimatedNumber } from "@/components/dashboard/useAnimatedNumber";
import {
  buildRentabilitySeries,
  interpretLeverage,
  leverageClass,
  normalizePercentInput
} from "@/lib/dashboard/rentabilite/rentabilityViewModel";
import { buildKpiTrend, type KpiTrend } from "@/lib/kpi/kpiTrend";
import type { CalculatedKpis } from "@/types/analysis";
import { KpiBenchmarkAutoIndicator } from "@/components/synthese/KpiBenchmarkAutoIndicator";
import type { BenchmarkableKpiKey } from "@/lib/benchmark/kpiMapping";

type RentabilityTestProps = {
  kpis: CalculatedKpis;
  previousKpis?: CalculatedKpis | null;
};

type ChartPoint = {
  label: string;
  roe: number;
  roce: number;
};

export function RentabilityTest({ kpis, previousKpis = null }: RentabilityTestProps) {
  // KPI rentabilité normalisés en % pour afficher une lecture homogène.
  const roePercent = normalizePercentInput(kpis.roe);
  const rocePercent = normalizePercentInput(kpis.roce);
  const previousRoePercent = normalizePercentInput(previousKpis?.roe ?? null);
  const previousRocePercent = normalizePercentInput(previousKpis?.roce ?? null);

  // Séries dérivées du modèle central pour conserver la même logique de projection.
  const roeSeries = useMemo(() => buildRentabilitySeries(kpis.roe, "roe"), [kpis.roe]);
  const roceSeries = useMemo(() => buildRentabilitySeries(kpis.roce, "roce"), [kpis.roce]);

  // On simplifie la courbe en 4 points clés pour rester lisible dans ce mode "test".
  const comparisonSeries = useMemo<ChartPoint[]>(
    () => buildComparisonSeries(roeSeries, roceSeries),
    [roeSeries, roceSeries]
  );

  // Les tendances servent à colorer les badges et guider un utilisateur non-financier.
  const roeTrend = useMemo(
    () => buildKpiTrend(kpis.roe, previousKpis?.roe ?? null),
    [kpis.roe, previousKpis?.roe]
  );
  const roceTrend = useMemo(
    () => buildKpiTrend(kpis.roce, previousKpis?.roce ?? null),
    [kpis.roce, previousKpis?.roce]
  );
  const leverageTrend = useMemo(
    () => buildKpiTrend(kpis.effet_levier, previousKpis?.effet_levier ?? null),
    [kpis.effet_levier, previousKpis?.effet_levier]
  );
  const leverageInterpretation = useMemo(
    () => interpretLeverage(kpis.effet_levier),
    [kpis.effet_levier]
  );

  // Compteurs animés React pour garder l'effet "data-react" sans script global.
  const animatedRoe = useAnimatedNumber(roePercent, { durationMs: 1200 });
  const animatedRoce = useAnimatedNumber(rocePercent, { durationMs: 1300 });
  const animatedLeverage = useAnimatedNumber(kpis.effet_levier, { durationMs: 1300 });

  const spread = useMemo(() => {
    if (roePercent === null || rocePercent === null) {
      return null;
    }
    return round(roePercent - rocePercent, 2);
  }, [roePercent, rocePercent]);
  const previousSpread = useMemo(() => {
    if (previousRoePercent === null || previousRocePercent === null) {
      return null;
    }
    return round(previousRoePercent - previousRocePercent, 2);
  }, [previousRoePercent, previousRocePercent]);
  const spreadTrend = useMemo(
    () => buildKpiTrend(spread, previousSpread),
    [spread, previousSpread]
  );

  const leverageValue = kpis.effet_levier;
  const debtShare =
    leverageValue === null
      ? 50
      : clamp((Math.max(leverageValue, 0) / (1 + Math.max(leverageValue, 0))) * 100, 0, 100);
  const equityShare = 100 - debtShare;

  // Mouse glow local: actif uniquement dans la section test pour éviter tout effet global.
  const [mouseGlow, setMouseGlow] = useState({ x: 0, y: 0, visible: false });

  function handleMouseMove(event: MouseEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setMouseGlow({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      visible: true
    });
  }

  function handleMouseLeave() {
    setMouseGlow((current) => ({ ...current, visible: false }));
  }

  const chartGeometry = useMemo(() => computeChartGeometry(comparisonSeries), [comparisonSeries]);
  const spreadTone = spread === null ? "na" : spread >= 0 ? "positive" : "negative";
  const spreadColor = spreadTone === "positive" ? "#C5A059" : spreadTone === "negative" ? "#ef4444" : "#ffffff";

  return (
    <section
      className="premium-analysis-root relative overflow-hidden rounded-2xl p-4 md:p-8"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className="pointer-events-none absolute z-[3] h-[480px] w-[480px] rounded-full bg-[radial-gradient(circle,rgba(197,160,89,0.12)_0%,transparent_62%)] transition-opacity duration-300"
        style={{
          left: `${mouseGlow.x}px`,
          top: `${mouseGlow.y}px`,
          opacity: mouseGlow.visible ? 1 : 0,
          transform: "translate(-50%, -50%)"
        }}
        aria-hidden="true"
      />
      <div className="noise-overlay" aria-hidden="true" />
      <div className="spotlight" aria-hidden="true" />

      {/* Badge top en flux normal pour un placement naturel. */}
      <div className="relative z-[4] mb-6 flex">
        <TestTopStatus label="Contrôle des flux" />
      </div>

      <header className="fade-up relative z-[4] mb-10 flex flex-col items-start justify-between gap-5 md:flex-row md:items-end">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="interactive-badge flex h-8 w-8 items-center justify-center border border-quantis-gold/20 bg-quantis-base">
              <span className="text-sm font-bold text-quantis-gold">Q</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-white">Quantis</span>
              <span className="text-[10px] font-mono text-quantis-muted">Financial Operating System</span>
            </div>
          </div>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight text-white md:text-4xl">
            Rentabilité & valeur actionnariale
          </h2>
          <p className="text-sm text-quantis-muted">
            Création de richesse, performance du capital et impact du levier.
          </p>
        </div>
      </header>

      <div className="relative z-[4] grid grid-cols-1 gap-5 md:grid-cols-12">
        <RentabilityMetricCard
          className="md:col-span-6"
          delayMs={100}
          searchId="analysis-rent-roe"
          title="Rentabilité actionnariale"
          tag="Return on Equity (ROE)"
          value={roePercent === null ? "N/D" : `${formatNumber(animatedRoe, 1)}%`}
          trend={roeTrend}
          icon={<Award className="h-4 w-4 text-white/40 transition-colors group-hover:text-quantis-gold" />}
          helper="Rentabilité des fonds propres: mesure ce que l'actionnaire gagne pour chaque euro investi."
          benchmarkKey="roe"
          benchmarkValue={roePercent}
        />

        <RentabilityMetricCard
          className="md:col-span-6"
          delayMs={150}
          searchId="analysis-rent-roce"
          title="Rentabilité opérationnelle"
          tag="Return on Capital Employed (ROCE)"
          value={rocePercent === null ? "N/D" : `${formatNumber(animatedRoce, 1)}%`}
          trend={roceTrend}
          icon={
            <BriefcaseBusiness className="h-4 w-4 text-white/40 transition-colors group-hover:text-quantis-gold" />
          }
          helper="Performance économique pure de l'exploitation, indépendamment du mode de financement."
          benchmarkKey="roce"
          benchmarkValue={rocePercent}
        />

        <article
          className="precision-card fade-up group col-span-1 rounded-2xl p-8 md:col-span-12"
          style={{ animationDelay: "200ms" }}
          data-search-id="analysis-rent-comparatif"
        >
          {/* Graphique comparatif ROE/ROCE: visualise l'effet de levier via l'écart entre les courbes. */}
          <div className="card-header mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Analyse de la création de valeur</h3>
              <p className="mt-1 text-[10px] font-mono uppercase text-white/45">
                ROE vs ROCE (effet de levier)
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-[10px] uppercase text-white/70">
              <LegendDot color="#ffffff" label="ROCE (activité)" />
              <LegendDot color={spreadColor} label="ROE (actionnaire)" />
              <KpiTrendPill trend={spreadTrend} compact />
            </div>
          </div>

          <div className="relative h-72 w-full">
            <svg className="h-full w-full" viewBox="0 0 1000 250" preserveAspectRatio="none">
              <line x1="0" y1="52" x2="1000" y2="52" stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
              <line x1="0" y1="102" x2="1000" y2="102" stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
              <line x1="0" y1="152" x2="1000" y2="152" stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
              <line x1="0" y1="202" x2="1000" y2="202" stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
              <line x1="0" y1="0" x2="0" y2="250" stroke="rgba(255,255,255,0.2)" />
              <line x1="0" y1="250" x2="1000" y2="250" stroke="rgba(255,255,255,0.2)" />

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

              <polyline points={chartGeometry.roceLine} fill="none" stroke="#ffffff" strokeWidth="2.4" />
              <polyline points={chartGeometry.roeLine} fill="none" stroke={spreadColor} strokeWidth="2.8" />

              {chartGeometry.rocePoints.map((point, index) => (
                <circle key={`roce-${point.x}`} cx={point.x} cy={point.y} r={index === chartGeometry.lastIndex ? 5 : 4} fill="#ffffff" />
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
                color: spreadColor
              }}
            >
              {spread === null ? "Écart indisponible" : `Écart ROE-ROCE: ${formatSignedSpread(spread)}`}
            </div>

            <div className="absolute inset-x-2 bottom-[-20px] flex justify-between text-[10px] font-mono text-white/45">
              {comparisonSeries.map((point) => (
                <span key={point.label}>{point.label}</span>
              ))}
            </div>
          </div>

          <p className="edu-text mt-8">
            {spread === null
              ? "Impossible de conclure sans ROE/ROCE."
              : spread >= 0
                ? "Effet de levier positif: la dette amplifie la rentabilité actionnariale."
                : "Effet de levier négatif: la dette pèse sur la rentabilité des fonds propres."}
          </p>
        </article>

        <article
          className="precision-card fade-up group col-span-1 flex flex-col gap-6 rounded-2xl p-6 md:col-span-12 md:flex-row md:items-center md:justify-between"
          style={{ animationDelay: "250ms" }}
          data-search-id="analysis-rent-levier"
        >
          {/* Dépendance bancaire: lecture simple du levier pour un profil non-financier. */}
          <div className="md:max-w-[65%]">
            <div className="card-header mb-4 flex items-start justify-between border-b-0 pb-0">
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold text-white">Dépendance bancaire</h3>
                <span className="tech-tag self-start text-[10px] font-mono uppercase text-white/60">
                  Levier financier (dettes / fonds propres)
                </span>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded border border-white/10 bg-white/5 transition-all duration-300 group-hover:border-quantis-gold/30 group-hover:bg-quantis-gold/10">
                <Scale className="h-4 w-4 text-white/40 transition-colors group-hover:text-quantis-gold" />
              </div>
            </div>
            <p className="edu-text mt-0 border-t-0 pt-0">{leverageInterpretation.helper}</p>
          </div>

          <div className="w-full md:w-[32%]">
            <p className="tnum data-react text-right text-[3rem] font-semibold leading-none tracking-tight text-white">
              {kpis.effet_levier === null ? "N/D" : `${formatNumber(animatedLeverage, 2)}x`}
            </p>
            <div className="mt-3 flex justify-end">
              <div className="flex items-center gap-2">
                <span className={`rounded-md border px-2 py-1 text-[11px] ${leverageClass(leverageInterpretation.status)}`}>
                  {leverageInterpretation.label}
                </span>
                <KpiTrendPill trend={leverageTrend} compact />
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-white/5 bg-quantis-base p-3">
              <div className="mb-2 flex justify-between text-[9px] uppercase text-white/45">
                <span>Capitaux propres</span>
                <span>Dette</span>
              </div>
              <div className="flex h-1.5 w-full overflow-hidden rounded-none border border-white/10 bg-white/10">
                <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${equityShare}%` }} />
                <div className="h-full bg-rose-500 transition-all duration-1000" style={{ width: `${debtShare}%` }} />
              </div>
            </div>
          </div>
        </article>

        <button
          type="button"
          className="precision-card fade-up col-span-1 w-full overflow-hidden rounded-xl p-0 text-left md:col-span-12"
          style={{ animationDelay: "300ms" }}
        >
          <div className="flex flex-col items-start justify-between gap-4 agent-panel p-6 md:flex-row md:items-center">
            <div className="flex items-center gap-5">
              <div className="flex h-12 w-12 items-center justify-center rounded agent-icon-shell">
                <Cpu className="h-5 w-5 text-white/60" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="agent-kicker text-[10px] font-mono">
                  QUANTIS_AGENT {" > "} RECOMMANDATION STRATÉGIQUE
                </span>
                <p className="text-[14px] font-medium agent-message">
                  {spread !== null && spread < 0
                    ? "Le levier dégrade la valeur actionnariale: prioriser la marge opérationnelle et le désendettement."
                    : "Le levier reste favorable: tester une croissance financée avec des garde-fous de liquidité."}
                </p>
              </div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded agent-arrow-shell transition-all duration-300 hover:border-quantis-gold hover:bg-quantis-gold">
              <ArrowRight className="h-5 w-5 transition-colors hover:text-black agent-arrow-icon" />
            </div>
          </div>
        </button>
      </div>
    </section>
  );
}

type RentabilityMetricCardProps = {
  searchId?: string;
  title: string;
  tag: string;
  value: string;
  helper: string;
  trend: KpiTrend;
  icon: ReactNode;
  delayMs: number;
  className?: string;
  benchmarkKey?: BenchmarkableKpiKey;
  benchmarkValue?: number | null;
};

function RentabilityMetricCard({
  searchId,
  title,
  tag,
  value,
  helper,
  trend,
  icon,
  delayMs,
  className,
  benchmarkKey,
  benchmarkValue
}: RentabilityMetricCardProps) {
  return (
    <article
      className={`precision-card fade-up group col-span-1 flex flex-col justify-between rounded-2xl p-6 ${className ?? ""}`}
      style={{ animationDelay: `${delayMs}ms` }}
      data-search-id={searchId}
    >
      <div>
        <div className="card-header flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-white">{title}</h3>
            <span className="tech-tag self-start text-[10px] font-mono uppercase text-white/60">{tag}</span>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded border border-white/10 bg-white/5 transition-all duration-300 group-hover:border-quantis-gold/30 group-hover:bg-quantis-gold/10">
            {icon}
          </div>
        </div>
        <p className="tnum data-react text-[3rem] font-semibold leading-none tracking-tight text-white">{value}</p>
        {benchmarkKey ? (
          <div className="mt-3">
            <KpiBenchmarkAutoIndicator kpiKey={benchmarkKey} value={benchmarkValue ?? null} kpiLabel={title} />
          </div>
        ) : null}
        <div className="mt-5 flex items-center gap-2">
          <KpiTrendPill trend={trend} compact />
        </div>
      </div>
      <p className="edu-text">{helper}</p>
    </article>
  );
}

function buildComparisonSeries(roeSeries: Array<{ month: string; value: number }>, roceSeries: Array<{ month: string; value: number }>): ChartPoint[] {
  const indexes = [0, 3, 7, 11];
  return indexes
    .filter((index) => roeSeries[index] && roceSeries[index])
    .map((index) => ({
      label: roeSeries[index].month,
      roe: roeSeries[index].value,
      roce: roceSeries[index].value
    }));
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
          { label: "Fin", roe: 0, roce: 0 }
        ];

  const allValues = safeSeries.flatMap((point) => [point.roe, point.roce]);
  const minValue = Math.min(...allValues, 0) - 2;
  const maxValue = Math.max(...allValues, 0) + 2;
  const spread = maxValue - minValue || 1;

  const xStep = width / (safeSeries.length - 1);
  const yScale = (value: number) =>
    height - bottomPadding - ((value - minValue) / spread) * plotHeight;

  const roePoints = safeSeries.map((point, index) => ({ x: index * xStep, y: yScale(point.roe) }));
  const rocePoints = safeSeries.map((point, index) => ({ x: index * xStep, y: yScale(point.roce) }));

  const roeLine = roePoints.map((point) => `${point.x},${point.y}`).join(" ");
  const roceLine = rocePoints.map((point) => `${point.x},${point.y}`).join(" ");
  const spreadArea = `${roeLine} ${[...rocePoints].reverse().map((point) => `${point.x},${point.y}`).join(" ")}`;

  const lastIndex = safeSeries.length - 1;
  const lastPoint = {
    x: roePoints[lastIndex].x,
    roeY: roePoints[lastIndex].y,
    roceY: rocePoints[lastIndex].y,
    midY: (roePoints[lastIndex].y + rocePoints[lastIndex].y) / 2
  };

  return { roeLine, roceLine, spreadArea, roePoints, rocePoints, lastPoint, lastIndex };
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

function formatSignedSpread(value: number): string {
  if (value > 0) {
    return `+${formatNumber(value, 2)} pts`;
  }
  if (value < 0) {
    return `${formatNumber(value, 2)} pts`;
  }
  return "0.00 pts";
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}


