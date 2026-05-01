// File: components/dashboard/navigation/InvestmentTest.tsx
// Role: propose une variante "test" premium de la section Investissement avec les KPI réels de l'analyse.
"use client";

import { type MouseEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  Building2,
  Cpu,
  Layers,
  Lock,
  Package,
  Truck,
  Users
} from "lucide-react";
import { formatPercent } from "@/components/dashboard/formatting";
import { KpiTrendPill } from "@/components/dashboard/navigation/KpiTrendPill";
import { useAnimatedNumber } from "@/components/dashboard/useAnimatedNumber";
import { buildKpiTrend, buildSignedTrend, type KpiTrend } from "@/lib/kpi/kpiTrend";
import { TestTopStatus } from "@/components/dashboard/navigation/TestTopStatus";
import type { CalculatedKpis } from "@/types/analysis";
import { KpiBenchmarkAutoIndicator } from "@/components/synthese/KpiBenchmarkAutoIndicator";
import type { BenchmarkableKpiKey } from "@/lib/benchmark/kpiMapping";

type InvestmentTestProps = {
  kpis: CalculatedKpis;
  previousKpis?: CalculatedKpis | null;
};

export function InvestmentTest({ kpis, previousKpis = null }: InvestmentTestProps) {
  // Compteurs animés pour conserver le rendu "data-react" de la maquette source.
  const animatedBfr = useAnimatedNumber(kpis.bfr, { durationMs: 1400 });
  const animatedRatioImmo = useAnimatedNumber(kpis.ratio_immo, { durationMs: 1200 });
  const animatedRotBfr = useAnimatedNumber(kpis.rot_bfr, { durationMs: 1250 });
  const animatedDso = useAnimatedNumber(kpis.dso, { durationMs: 1200 });
  const animatedDio = useAnimatedNumber(kpis.rot_stocks, { durationMs: 1200 });
  const animatedDpo = useAnimatedNumber(kpis.dpo, { durationMs: 1200 });

  const bfrYearlyVariation = useMemo(
    () => computeYearlyChangePercent(kpis.bfr, previousKpis?.bfr ?? null),
    [kpis.bfr, previousKpis?.bfr]
  );

  const bfrTrend = useMemo(
    () => buildKpiTrend(kpis.bfr, previousKpis?.bfr ?? null),
    [kpis.bfr, previousKpis?.bfr]
  );
  const bfrVariationTrend = useMemo(
    () => buildSignedTrend(bfrYearlyVariation),
    [bfrYearlyVariation]
  );
  const ratioImmoTrend = useMemo(
    () => buildKpiTrend(kpis.ratio_immo, previousKpis?.ratio_immo ?? null),
    [kpis.ratio_immo, previousKpis?.ratio_immo]
  );
  const rotBfrTrend = useMemo(
    () => buildKpiTrend(kpis.rot_bfr, previousKpis?.rot_bfr ?? null),
    [kpis.rot_bfr, previousKpis?.rot_bfr]
  );
  const dsoTrend = useMemo(
    () => buildKpiTrend(kpis.dso, previousKpis?.dso ?? null),
    [kpis.dso, previousKpis?.dso]
  );
  const dioTrend = useMemo(
    () => buildKpiTrend(kpis.rot_stocks, previousKpis?.rot_stocks ?? null),
    [kpis.rot_stocks, previousKpis?.rot_stocks]
  );
  const dpoTrend = useMemo(
    () => buildKpiTrend(kpis.dpo, previousKpis?.dpo ?? null),
    [kpis.dpo, previousKpis?.dpo]
  );
  const chartViewportRef = useRef<HTMLDivElement | null>(null);
  const [chartViewportSize, setChartViewportSize] = useState({ width: 1000, height: 260 });

  useEffect(() => {
    const node = chartViewportRef.current;
    if (!node || typeof ResizeObserver === "undefined") {
      return;
    }

    const syncSize = (width: number, height: number) => {
      const nextWidth = Math.max(Math.round(width), 320);
      const nextHeight = Math.max(Math.round(height), 220);
      setChartViewportSize((current) => {
        if (current.width === nextWidth && current.height === nextHeight) {
          return current;
        }
        return { width: nextWidth, height: nextHeight };
      });
    };

    syncSize(node.clientWidth, node.clientHeight);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      syncSize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  // Répartition visuelle des segments du cycle d'exploitation (emplois vs ressources).
  const dsoDays = Math.max(kpis.dso ?? 0, 0);
  const dioDays = Math.max(kpis.rot_stocks ?? 0, 0);
  const dpoDays = Math.max(kpis.dpo ?? 0, 0);
  const emploisDays = dsoDays + dioDays;
  const bfrGapDays = kpis.rot_bfr ?? Math.max(emploisDays - dpoDays, 0);
  const chartCanvasWidth = chartViewportSize.width;
  const chartCanvasHeight = chartViewportSize.height;
  const chartSidePadding = Math.max(Math.round(chartCanvasWidth * 0.025), 24);
  const chartInnerMaxWidth = Math.max(chartCanvasWidth - chartSidePadding * 2, 1);
  const chartScale =
    (chartInnerMaxWidth - 8) / Math.max(emploisDays + 8, dpoDays + Math.max(bfrGapDays, 0) + 8, 1);

  const chartStartX = chartSidePadding;
  const topGap = 8;
  const rawStocksRectWidth = Math.max(dioDays * chartScale, 60);
  const rawClientsRectWidth = Math.max(dsoDays * chartScale, 120);
  const topTotalWidth = rawStocksRectWidth + topGap + rawClientsRectWidth;
  const topCompressRatio = topTotalWidth > chartInnerMaxWidth ? chartInnerMaxWidth / topTotalWidth : 1;
  const stocksRectWidth = rawStocksRectWidth * topCompressRatio;
  const clientsRectWidth = rawClientsRectWidth * topCompressRatio;
  const clientsRectX = chartStartX + stocksRectWidth + topGap;
  const fournisseursRectX = chartStartX;
  const fournisseursRectWidth = Math.min(Math.max(dpoDays * chartScale, 140), chartInnerMaxWidth);
  const bfrRectWidth = Math.min(Math.max(Math.max(bfrGapDays, 0) * chartScale, 70), chartInnerMaxWidth);
  const bfrVisualX = chartStartX + Math.max((chartInnerMaxWidth - bfrRectWidth) / 2, 0);

  const chartTopY = Math.round(chartCanvasHeight * 0.09);
  const chartMiddleY = Math.round(chartCanvasHeight * 0.41);
  const chartBottomY = Math.round(chartCanvasHeight * 0.72);
  const topBarHeight = Math.round(chartCanvasHeight * 0.16);
  const middleBarHeight = topBarHeight;
  const bottomBarHeight = Math.round(chartCanvasHeight * 0.18);
  const labelOffsetY = Math.max(4, Math.round(chartCanvasHeight * 0.02));
  const topLabelY = chartTopY + topBarHeight / 2 + labelOffsetY;
  const middleLabelY = chartMiddleY + middleBarHeight / 2 + labelOffsetY;
  const bottomLabelY = chartBottomY + bottomBarHeight / 2 + labelOffsetY;
  const topDividerY = Math.round(chartCanvasHeight * 0.34);
  const bottomDividerY = Math.round(chartCanvasHeight * 0.66);
  const gridStep = chartInnerMaxWidth / 4;
  const verticalGridLines = [0, 1, 2, 3, 4].map((index) => chartStartX + index * gridStep);
  const labelFontSize = chartCanvasWidth < 700 ? 9 : 10;

  // Mouse glow local: limité à cette section test pour éviter les effets de bord.
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

      {/* Badge de contexte en flux normal pour retirer l'effet "bandeau superposé". */}
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
            Investissement & BFR
          </h2>
          <p className="text-sm text-quantis-muted">Cycle clients-fournisseurs et usure des immobilisations</p>
        </div>

        <div className="mt-3 flex flex-col items-end gap-2 md:mt-0">
          <div className="flex items-center gap-2">
            <Layers className="h-3 w-3 text-white/30" />
            <span className="text-[11px] font-mono uppercase text-white/40">
              Pilotage du cycle d&apos;exploitation
            </span>
          </div>
          <div className="interactive-badge flex items-center gap-2 rounded border border-white/10 bg-white/[0.02] px-3 py-1">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_#10B981]" />
            <span className="text-[10px] font-medium uppercase tracking-widest text-white/80">Comparatif N vs N-1</span>
          </div>
        </div>
      </header>

      <div className="relative z-[4] grid grid-cols-1 gap-5 md:grid-cols-12">
        <InvestmentMetricCard
          delayMs={100}
          searchId="analysis-invest-bfr"
          className="md:col-span-4"
          title="BFR net à financer"
          tag="Besoin en fonds de roulement"
          value={kpis.bfr === null ? "N/D" : formatCompactCurrency(animatedBfr)}
          statusLabel={
            kpis.bfr === null
              ? "Donnée indisponible"
              : kpis.bfr <= 0
                ? "Cycle auto-financé"
                : "Besoin à financer"
          }
          code="BFR_NET_01"
          trend={bfrTrend}
          icon={<Lock className="h-4 w-4 text-white/40 transition-colors group-hover:text-quantis-gold" />}
          helper="Montant immobilisé dans le cycle (stocks + créances - fournisseurs)."
          benchmarkKey="bfr"
          benchmarkValue={kpis.bfr}
        />

        <InvestmentMetricCard
          delayMs={150}
          searchId="analysis-invest-variation-bfr"
          className="md:col-span-4"
          title="Variation annuelle"
          tag="Évolution du BFR (N vs N-1)"
          value={formatSignedPercent(bfrYearlyVariation)}
          statusLabel={
            bfrYearlyVariation === null
              ? "Donnée indisponible"
              : bfrYearlyVariation <= 0
                ? "Baisse du besoin"
                : "Hausse du besoin"
          }
          code="VAR_BFR_YTD"
          trend={bfrVariationTrend}
          icon={<Activity className="h-4 w-4 text-white/40 transition-colors group-hover:text-quantis-gold" />}
          helper="Variation du besoin de financement entre l'exercice courant et le précédent."
        />

        <InvestmentMetricCard
          delayMs={200}
          searchId="analysis-invest-ratio-immo"
          className="md:col-span-4"
          title="État des immobilisations"
          tag="Immobilisations nettes / brutes"
          value={kpis.ratio_immo === null ? "N/D" : formatPercent(animatedRatioImmo)}
          statusLabel={
            kpis.ratio_immo === null
              ? "Donnée indisponible"
              : kpis.ratio_immo >= 0.7
                ? "Usure maîtrisée"
                : kpis.ratio_immo >= 0.4
                  ? "À surveiller"
                  : "Usure élevée"
          }
          code="CAPEX_RATIO"
          trend={ratioImmoTrend}
          icon={<Building2 className="h-4 w-4 text-white/40 transition-colors group-hover:text-quantis-gold" />}
          helper="Part des immobilisations encore non amortie (net / brut)."
        />

        <article
          className="precision-card fade-up group col-span-1 rounded-2xl p-8 md:col-span-12"
          style={{ animationDelay: "300ms" }}
          data-search-id="analysis-invest-rotation-bfr"
        >
          {/* Bloc central: lecture détaillée de la rotation BFR et des trois composantes de délai. */}
          <div className="card-header mb-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Pilotage du cycle d&apos;exploitation</h3>
              <div className="mt-2 flex items-center gap-2">
                <span className="tech-tag text-[10px] font-mono uppercase text-white/60">
                  Ratio de rotation du BFR (jours)
                </span>
                <span className="text-[10px] font-mono text-white/35">CYCLE_SPEED</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <p className="tnum text-4xl font-semibold tracking-tight text-white">
                {kpis.rot_bfr === null ? "N/D" : `${Math.round(animatedRotBfr)} jours`}
              </p>
              <KpiTrendPill trend={rotBfrTrend} compact />
              <KpiBenchmarkAutoIndicator kpiKey="rot_bfr" value={kpis.rot_bfr} kpiLabel="Rotation BFR" />
            </div>
          </div>

          <div className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-3">
            <DelayCard
              title="Délai clients (DSO)"
              value={kpis.dso === null ? "N/D" : `${Math.round(animatedDso)} j`}
              trend={dsoTrend}
              icon={<Users className="h-4 w-4 text-amber-400/70" />}
              hint="Temps moyen d'encaissement des factures clients."
              badgeLabel="↘ À réduire"
              badgeTone="warning"
              benchmarkKey="dso"
              benchmarkValue={kpis.dso}
            />
            <DelayCard
              title="Délai stocks (DIO)"
              value={kpis.rot_stocks === null ? "N/D" : `${Math.round(animatedDio)} j`}
              trend={dioTrend}
              icon={<Package className="h-4 w-4 text-amber-400/70" />}
              hint="Temps moyen d'écoulement du stock."
              badgeLabel="↘ À réduire"
              badgeTone="warning"
              benchmarkKey="rot_stocks"
              benchmarkValue={kpis.rot_stocks}
            />
            <DelayCard
              title="Délai fournisseurs (DPO)"
              value={kpis.dpo === null ? "N/D" : `${Math.round(animatedDpo)} j`}
              trend={dpoTrend}
              icon={<Truck className="h-4 w-4 text-emerald-400/70" />}
              hint="Délai moyen accordé par les fournisseurs."
              badgeLabel="↗ À allonger"
              badgeTone="good"
              benchmarkKey="dpo"
              benchmarkValue={kpis.dpo}
            />
          </div>

          {/* Modélisation alignée sur la maquette HTML d'origine (bars SVG emplois/ressources + écart BFR). */}
          <div className="w-full rounded-xl border border-white/5 bg-quantis-base p-5 transition-colors group-hover:border-quantis-gold/10 md:p-6">
            <h4 className="mb-4 text-center text-[11px] font-semibold uppercase tracking-widest text-white/60 transition-colors group-hover:text-white/80 md:mb-5">
              Modélisation de l&apos;équilibre du BFR
            </h4>

            <div
              ref={chartViewportRef}
              className="h-[220px] min-h-[180px] md:min-h-[220px] lg:h-[260px] lg:min-h-[260px]"
            >
              <svg className="block h-full w-full" viewBox={`0 0 ${chartCanvasWidth} ${chartCanvasHeight}`}>
                {verticalGridLines.map((x) => (
                  <line
                    key={`grid-${x}`}
                    x1={x}
                    y1={0}
                    x2={x}
                    y2={chartCanvasHeight}
                    stroke="rgba(255, 255, 255, 0.05)"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                ))}

                <line
                  x1={chartStartX}
                  y1={topDividerY}
                  x2={chartStartX + chartInnerMaxWidth}
                  y2={topDividerY}
                  stroke="rgba(255,255,255,0.04)"
                  strokeWidth="1"
                />
                <line
                  x1={chartStartX}
                  y1={bottomDividerY}
                  x2={chartStartX + chartInnerMaxWidth}
                  y2={bottomDividerY}
                  stroke="rgba(255,255,255,0.04)"
                  strokeWidth="1"
                />

                <g className="bar-segment">
                  <rect x={chartStartX} y={chartTopY} width={stocksRectWidth} height={topBarHeight} fill="rgba(245, 158, 11, 0.15)" stroke="#F59E0B" strokeWidth="1" rx="2" />
                  <text x={chartStartX + stocksRectWidth / 2} y={topLabelY} fill="#FDBA74" fontSize={labelFontSize} fontWeight="600" fontFamily="Inter" textAnchor="middle">
                    STOCKS ({kpis.rot_stocks === null ? "N/D" : `${Math.round(animatedDio)}j`})
                  </text>
                </g>
                <g className="bar-segment">
                  <rect x={clientsRectX} y={chartTopY} width={clientsRectWidth} height={topBarHeight} fill="rgba(245, 158, 11, 0.15)" stroke="#F59E0B" strokeWidth="1" rx="2" />
                  <text x={clientsRectX + clientsRectWidth / 2} y={topLabelY} fill="#FDBA74" fontSize={labelFontSize} fontWeight="600" fontFamily="Inter" textAnchor="middle">
                    CLIENTS ({kpis.dso === null ? "N/D" : `${Math.round(animatedDso)}j`})
                  </text>
                </g>

                <g className="bar-segment">
                  <rect x={fournisseursRectX} y={chartMiddleY} width={fournisseursRectWidth} height={middleBarHeight} fill="rgba(16, 185, 129, 0.15)" stroke="#10B981" strokeWidth="1" rx="2" />
                  <text x={fournisseursRectX + fournisseursRectWidth / 2} y={middleLabelY} fill="#6EE7B7" fontSize={labelFontSize} fontWeight="600" fontFamily="Inter" textAnchor="middle">
                    FOURNISSEURS ({kpis.dpo === null ? "N/D" : `${Math.round(animatedDpo)}j`})
                  </text>
                </g>

                <g className="bar-segment">
                  <rect x={bfrVisualX} y={chartBottomY} width={bfrRectWidth} height={bottomBarHeight} fill="rgba(239, 68, 68, 0.15)" stroke="#EF4444" strokeWidth="1" strokeDasharray="4 4" rx="2" />
                  <text x={bfrVisualX + bfrRectWidth / 2} y={bottomLabelY} fill="#FCA5A5" fontSize={labelFontSize} fontWeight="700" fontFamily="Inter" textAnchor="middle">
                    BFR: {kpis.rot_bfr === null ? "N/D" : `${Math.round(animatedRotBfr)}j`}
                  </text>
                </g>
              </svg>
            </div>
          </div>

          <p className="edu-text mt-8 text-[13px]">
            <strong className="text-white/60 transition-colors group-hover:text-quantis-gold">Lecture stratégique :</strong>{" "}
            Le BFR représente le cash mobilisé au quotidien. L&apos;objectif est de réduire les blocs oranges
            (encaisser plus vite, stocker moins) et d&apos;allonger le bloc vert (payer plus tard) afin de réduire la
            zone rouge à financer.
          </p>
        </article>

        <button
          type="button"
          className="precision-card fade-up col-span-1 w-full overflow-hidden rounded-xl p-0 text-left md:col-span-12"
          style={{ animationDelay: "400ms" }}
        >
          {/* Bandeau d'action IA: cohérent avec la narration des autres sections de test. */}
          <div className="flex flex-col items-start justify-between gap-4 agent-panel p-6 md:flex-row md:items-center">
            <div className="flex items-center gap-5">
              <div className="flex h-12 w-12 items-center justify-center rounded agent-icon-shell">
                <Cpu className="h-5 w-5 text-white/60" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="agent-kicker text-[10px] font-mono">
                  QUANTIS_AGENT {" > "} OPTIMISATION BFR
                </span>
                <p className="text-[14px] font-medium agent-message">
                  Priorité recommandée: sécuriser les encaissements clients et lisser les niveaux de stock.
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

type InvestmentMetricCardProps = {
  searchId?: string;
  title: string;
  tag: string;
  value: string;
  statusLabel: string;
  code: string;
  helper: string;
  icon: ReactNode;
  trend: KpiTrend;
  delayMs: number;
  className?: string;
  benchmarkKey?: BenchmarkableKpiKey;
  benchmarkValue?: number | null;
};

function InvestmentMetricCard({
  searchId,
  title,
  tag,
  value,
  statusLabel,
  code,
  helper,
  icon,
  trend,
  delayMs,
  className,
  benchmarkKey,
  benchmarkValue
}: InvestmentMetricCardProps) {
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
        <p className="tnum data-react text-[2.2rem] font-medium leading-none tracking-tight text-white">{value}</p>
        {benchmarkKey ? (
          <div className="mt-3">
            <KpiBenchmarkAutoIndicator kpiKey={benchmarkKey} value={benchmarkValue ?? null} kpiLabel={title} />
          </div>
        ) : null}
        <div className="mt-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-white/80">{statusLabel}</span>
            <KpiTrendPill trend={trend} compact />
          </div>
          <span className="text-[10px] font-mono text-white/35">{code}</span>
        </div>
      </div>
      <p className="edu-text">{helper}</p>
    </article>
  );
}

type DelayCardProps = {
  title: string;
  value: string;
  trend: KpiTrend;
  hint: string;
  badgeLabel: string;
  badgeTone: "good" | "warning";
  icon: ReactNode;
  benchmarkKey?: BenchmarkableKpiKey;
  benchmarkValue?: number | null;
};

function DelayCard({
  title,
  value,
  trend,
  hint,
  badgeLabel,
  badgeTone,
  icon,
  benchmarkKey,
  benchmarkValue
}: DelayCardProps) {
  const badgeClass =
    badgeTone === "good"
      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
      : "border-amber-400/30 bg-amber-500/10 text-amber-300";

  return (
    <div className="interactive-badge rounded-xl border border-white/5 bg-white/[0.02] p-5 transition-all hover:border-quantis-gold/30 hover:bg-quantis-gold/[0.03]">
      <div className="mb-4 flex items-start justify-between">
        <span className="text-[10px] uppercase tracking-widest text-white/55">{title}</span>
        {icon}
      </div>
      <div className="mb-3 flex items-end justify-between gap-2">
        <span className="tnum text-3xl font-medium text-white">{value}</span>
        <span className={`rounded px-2 py-1 text-[9px] uppercase tracking-wide ${badgeClass}`}>{badgeLabel}</span>
      </div>
      {benchmarkKey ? (
        <div className="mb-2">
          <KpiBenchmarkAutoIndicator kpiKey={benchmarkKey} value={benchmarkValue ?? null} kpiLabel={title} />
        </div>
      ) : null}
      <KpiTrendPill trend={trend} compact className="mb-2" />
      <p className="text-[10px] italic text-white/45">{hint}</p>
    </div>
  );
}

function formatCompactCurrency(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR")} €`;
}

function computeYearlyChangePercent(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) {
    return null;
  }

  return ((current - previous) / Math.abs(previous)) * 100;
}

function formatSignedPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return "N/D";
  }
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)}%`;
}
